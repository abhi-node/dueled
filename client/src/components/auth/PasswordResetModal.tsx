import React, { useState } from 'react';
import { AuthService } from '../../services/authService';
import { toast } from '../../store/toastStore';
import { useFormValidation, validationRules } from '../../hooks/useFormValidation';
import { LoadingButton } from '../common/Loading';

interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PasswordResetModal({ isOpen, onClose }: PasswordResetModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const { values, formValidation, handleChange, handleBlur, validateAll, reset } = useFormValidation({
    initialValues: {
      email: '',
    },
    validationRules: {
      email: [
        validationRules.required(),
        validationRules.email(),
      ],
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateAll()) {
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await AuthService.requestPasswordReset(values.email);
      
      if (response.success) {
        setEmailSent(true);
        toast.success('Reset email sent!', 'Check your email for password reset instructions.');
      } else {
        toast.error('Failed to send reset email', response.message || 'Please try again.');
      }
    } catch (error) {
      toast.error('Error', 'Failed to send password reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    reset();
    setEmailSent(false);
    setIsLoading(false);
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-arena-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">
            {emailSent ? 'Check Your Email' : 'Reset Password'}
          </h2>
          <button
            onClick={handleClose}
            className="text-arena-400 hover:text-arena-200 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {emailSent ? (
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-green-900 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-arena-300">
              We've sent password reset instructions to <strong>{values.email}</strong>
            </p>
            <p className="text-sm text-arena-400">
              Check your email and follow the link to reset your password. The link will expire in 1 hour.
            </p>
            <button
              onClick={handleClose}
              className="btn-primary w-full py-2 mt-4"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-arena-300 text-sm mb-4">
              Enter your email address and we'll send you a link to reset your password.
            </p>
            
            <div>
              <label htmlFor="reset-email" className="block text-sm font-medium text-arena-300 mb-1">
                Email Address
              </label>
              <input
                type="email"
                id="reset-email"
                name="email"
                value={values.email}
                onChange={(e) => handleChange('email', e.target.value)}
                onBlur={() => handleBlur('email')}
                className={`input-field w-full ${
                  formValidation.email.isTouched && formValidation.email.error
                    ? 'border-red-500 focus:border-red-500'
                    : formValidation.email.isTouched && formValidation.email.isValid
                    ? 'border-green-500'
                    : ''
                }`}
                placeholder="Enter your email address"
              />
              {formValidation.email.isTouched && formValidation.email.error && (
                <p className="mt-1 text-sm text-red-400">{formValidation.email.error}</p>
              )}
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="btn-secondary flex-1 py-2"
                disabled={isLoading}
              >
                Cancel
              </button>
              <LoadingButton
                type="submit"
                isLoading={isLoading}
                disabled={!formValidation.email.isValid}
                className="btn-primary flex-1 py-2"
              >
                Send Reset Link
              </LoadingButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}