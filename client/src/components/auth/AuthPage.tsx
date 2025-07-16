import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import { useFormValidation, validationRules, usePasswordStrength } from '../../hooks/useFormValidation';
import { LoadingButton } from '../common/Loading';
import { PasswordResetModal } from './PasswordResetModal';

type AuthMode = 'login' | 'register' | 'anonymous';

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const navigate = useNavigate();
  
  const { login, register, loginAnonymous, isLoading, error, clearError, isAuthenticated, user } = useAuthStore();

  // Don't redirect - allow users to see the auth page
  // Guests might want to upgrade to a full account

  // Memoize initialValues to prevent recreation on every render
  const initialValues = useMemo(() => ({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  }), []);

  // Memoize validationRules to prevent recreation on every render
  const validationRulesConfig = useMemo(() => ({
    username: [
      validationRules.required(),
      validationRules.username(),
    ],
    email: mode === 'register' ? [
      validationRules.required(),
      validationRules.email(),
    ] : [],
    password: [
      validationRules.required(),
      validationRules.password(),
    ],
    confirmPassword: mode === 'register' ? [
      validationRules.required(),
      {
        test: () => {
          // This will be properly handled in the useFormValidation hook
          return true;
        },
        message: 'Passwords do not match',
      },
    ] : [],
  }), [mode]);

  // Form validation setup
  const { 
    values, 
    formValidation, 
    handleChange, 
    handleBlur, 
    validateAll, 
    reset,
    isFormValid 
  } = useFormValidation({
    initialValues,
    validationRules: validationRulesConfig,
    validateOnChange: true,
    validateOnBlur: true,
  });

  // Password strength for registration
  const passwordStrength = usePasswordStrength(values.password);

  // Clear errors when switching modes
  useEffect(() => {
    clearError();
    reset();
  }, [mode, clearError, reset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateAll()) {
      return;
    }

    try {
      let success = false;
      
      if (mode === 'login') {
        success = await login(values.username, values.password);
        if (success) {
          toast.success('Welcome back!', `Logged in as ${values.username}`);
          navigate('/');
        }
      } else if (mode === 'register') {
        success = await register(values.username, values.email, values.password, values.confirmPassword);
        if (success) {
          toast.success('Account created!', `Welcome to Dueled, ${values.username}!`);
          navigate('/');
        }
      }
      
      if (!success && error) {
        toast.error('Authentication Failed', error);
      }
    } catch (err) {
      toast.error('Error', 'An unexpected error occurred. Please try again.');
    }
  };

  const handleAnonymousPlay = async () => {
    try {
      const success = await loginAnonymous();
      if (success) {
        toast.info('Playing as Guest', 'Your progress will not be saved');
        navigate('/');
      } else {
        toast.error('Failed to start guest session', error || 'Please try again');
      }
    } catch (err) {
      toast.error('Error', 'Failed to create guest session');
    }
  };

  const handleInputChange = (fieldName: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    handleChange(fieldName, e.target.value);
  };

  const handleInputBlur = (fieldName: string) => () => {
    handleBlur(fieldName);
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="card p-8 w-full max-w-md">
        {isAuthenticated && user && (
          <div className="bg-blue-900 border border-blue-600 text-blue-300 px-4 py-3 rounded mb-6">
            {user.isAnonymous ? (
              <>
                <p className="font-bold">Playing as Guest</p>
                <p className="text-sm mt-1">Register below to save your progress!</p>
              </>
            ) : (
              <>
                <p className="font-bold">Already logged in as {user.username}</p>
                <p className="text-sm mt-1">
                  <button 
                    onClick={() => navigate('/')}
                    className="underline hover:text-blue-200"
                  >
                    Return to game
                  </button>
                  {' or '}
                  <button 
                    onClick={() => {
                      useAuthStore.getState().logout();
                    }}
                    className="underline hover:text-blue-200"
                  >
                    logout
                  </button>
                </p>
              </>
            )}
          </div>
        )}
        
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-dueled-500 mb-2">
            {mode === 'login' ? 'Login' : 'Register'}
          </h2>
          <p className="text-arena-300">
            {mode === 'login' 
              ? 'Welcome back, warrior!' 
              : 'Join the arena!'
            }
          </p>
        </div>

        {error && (
          <div className="bg-red-900 border border-red-600 text-red-300 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-arena-300 mb-1">
              Username
            </label>
            <input
              type="text"
              id="username"
              name="username"
              value={values.username}
              onChange={handleInputChange('username')}
              onBlur={handleInputBlur('username')}
              className={`input-field w-full ${
                formValidation.username.isTouched && formValidation.username.error
                  ? 'border-red-500 focus:border-red-500'
                  : formValidation.username.isTouched && formValidation.username.isValid
                  ? 'border-green-500'
                  : ''
              }`}
              placeholder="Enter your username"
            />
            {formValidation.username.isTouched && formValidation.username.error && (
              <p className="mt-1 text-sm text-red-400">{formValidation.username.error}</p>
            )}
          </div>

          {mode === 'register' && (
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-arena-300 mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={values.email}
                onChange={handleInputChange('email')}
                onBlur={handleInputBlur('email')}
                className={`input-field w-full ${
                  formValidation.email.isTouched && formValidation.email.error
                    ? 'border-red-500 focus:border-red-500'
                    : formValidation.email.isTouched && formValidation.email.isValid
                    ? 'border-green-500'
                    : ''
                }`}
                placeholder="Enter your email"
              />
              {formValidation.email.isTouched && formValidation.email.error && (
                <p className="mt-1 text-sm text-red-400">{formValidation.email.error}</p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-arena-300 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                value={values.password}
                onChange={handleInputChange('password')}
                onBlur={handleInputBlur('password')}
                className={`input-field w-full pr-10 ${
                  formValidation.password.isTouched && formValidation.password.error
                    ? 'border-red-500 focus:border-red-500'
                    : formValidation.password.isTouched && formValidation.password.isValid
                    ? 'border-green-500'
                    : ''
                }`}
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-arena-400 hover:text-arena-200"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            {formValidation.password.isTouched && formValidation.password.error && (
              <p className="mt-1 text-sm text-red-400">{formValidation.password.error}</p>
            )}
            
            {/* Password strength indicator for registration */}
            {mode === 'register' && values.password && (
              <div className="mt-2">
                <div className="flex items-center space-x-2">
                  <div className="flex-1 bg-arena-600 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${passwordStrength.color}`}
                      style={{ width: `${(passwordStrength.score / 4) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-arena-300 min-w-fit">{passwordStrength.strength}</span>
                </div>
                {passwordStrength.feedback.length > 0 && (
                  <ul className="mt-1 text-xs text-arena-400 space-y-1">
                    {passwordStrength.feedback.map((feedback, index) => (
                      <li key={index}>• {feedback}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {mode === 'register' && (
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-arena-300 mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={values.confirmPassword}
                onChange={handleInputChange('confirmPassword')}
                onBlur={handleInputBlur('confirmPassword')}
                className={`input-field w-full ${
                  formValidation.confirmPassword.isTouched && formValidation.confirmPassword.error
                    ? 'border-red-500 focus:border-red-500'
                    : formValidation.confirmPassword.isTouched && formValidation.confirmPassword.isValid
                    ? 'border-green-500'
                    : ''
                }`}
                placeholder="Confirm your password"
              />
              {formValidation.confirmPassword.isTouched && formValidation.confirmPassword.error && (
                <p className="mt-1 text-sm text-red-400">{formValidation.confirmPassword.error}</p>
              )}
            </div>
          )}

          <LoadingButton
            type="submit"
            isLoading={isLoading}
            disabled={!isFormValid}
            className="btn-primary w-full py-3"
          >
            {mode === 'login' ? 'Login' : 'Register'}
          </LoadingButton>
          
          {/* Debug info for development */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-2 p-2 bg-gray-800 text-xs">
              <div>Form Valid: {isFormValid ? 'Yes' : 'No'}</div>
              {Object.entries(formValidation).map(([field, validation]) => (
                <div key={field}>
                  {field}: {validation.isValid ? '✓' : '✗'} 
                  {validation.error && ` (${validation.error})`}
                </div>
              ))}
            </div>
          )}
        </form>

        <div className="mt-6 space-y-4">
          <div className="text-center">
            <button
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-dueled-500 hover:text-dueled-400 text-sm transition-colors"
            >
              {mode === 'login' 
                ? "Don't have an account? Register" 
                : 'Already have an account? Login'
              }
            </button>
          </div>

          {mode === 'login' && (
            <div className="text-center">
              <button
                onClick={() => setShowPasswordReset(true)}
                className="text-arena-400 hover:text-arena-200 text-sm transition-colors"
              >
                Forgot your password?
              </button>
            </div>
          )}

          <div className="border-t border-arena-600 pt-4">
            <LoadingButton
              onClick={handleAnonymousPlay}
              isLoading={isLoading}
              className="btn-secondary w-full py-3"
            >
              Play as Guest
            </LoadingButton>
            <p className="text-xs text-arena-400 text-center mt-2">
              Progress won't be saved
            </p>
          </div>
        </div>
      </div>

      <PasswordResetModal
        isOpen={showPasswordReset}
        onClose={() => setShowPasswordReset(false)}
      />
    </div>
  );
}