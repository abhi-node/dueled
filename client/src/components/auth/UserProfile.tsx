import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import { useFormValidation, validationRules } from '../../hooks/useFormValidation';
import { LoadingButton } from '../common/Loading';
import { useAuthGuard } from '../common/ProtectedRoute';

export function UserProfile() {
  const { user, updateProfile, logout, isLoading } = useAuthStore();
  const { isGuest } = useAuthGuard();
  const [isEditing, setIsEditing] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  // Profile form validation
  const profileForm = useFormValidation({
    initialValues: {
      username: user?.username || '',
      email: user?.email || '',
    },
    validationRules: {
      username: [
        validationRules.required(),
        validationRules.username(),
      ],
      email: [
        validationRules.required(),
        validationRules.email(),
      ],
    },
  });

  // Password change form validation
  const passwordForm = useFormValidation({
    initialValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    validationRules: {
      currentPassword: [
        validationRules.required(),
      ],
      newPassword: [
        validationRules.required(),
        validationRules.password(),
      ],
      confirmPassword: [
        validationRules.required(),
      ],
    },
  });

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profileForm.validateAll()) {
      return;
    }

    try {
      const success = await updateProfile({
        username: profileForm.values.username,
        email: profileForm.values.email,
      });

      if (success) {
        toast.success('Profile updated!', 'Your profile has been successfully updated.');
        setIsEditing(false);
      }
    } catch (error) {
      toast.error('Update failed', 'Failed to update profile. Please try again.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!passwordForm.validateAll()) {
      return;
    }

    try {
      // TODO: Implement password change API call
      toast.success('Password changed!', 'Your password has been successfully updated.');
      setShowChangePassword(false);
      passwordForm.reset();
    } catch (error) {
      toast.error('Password change failed', 'Failed to change password. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.info('Logged out', 'You have been successfully logged out.');
    } catch (error) {
      toast.error('Logout failed', 'Failed to logout. Please try again.');
    }
  };

  if (!user) {
    return (
      <div className="card p-6">
        <p className="text-arena-300">No user data available.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Profile Header */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Profile</h1>
          {isGuest && (
            <span className="bg-yellow-900 text-yellow-300 px-3 py-1 rounded-full text-sm">
              Guest Account
            </span>
          )}
        </div>

        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-arena-300 mb-1">
              Username
            </label>
            <p className="text-white font-medium">{user.username}</p>
          </div>
          
          {!isGuest && (
            <div>
              <label className="block text-sm font-medium text-arena-300 mb-1">
                Email
              </label>
              <p className="text-white">{user.email || 'Not provided'}</p>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-arena-300 mb-1">
              Rating
            </label>
            <p className="text-dueled-400 font-bold">{user.rating || 1000}</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-arena-300 mb-1">
              Account Type
            </label>
            <p className="text-white">
              {isGuest ? 'Guest' : 'Registered'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          {!isGuest && (
            <>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="btn-primary px-4 py-2"
              >
                {isEditing ? 'Cancel Edit' : 'Edit Profile'}
              </button>
              <button
                onClick={() => setShowChangePassword(!showChangePassword)}
                className="btn-secondary px-4 py-2"
              >
                Change Password
              </button>
            </>
          )}
          <button
            onClick={handleLogout}
            className="btn-danger px-4 py-2"
          >
            {isGuest ? 'End Session' : 'Logout'}
          </button>
        </div>
      </div>

      {/* Edit Profile Form */}
      {isEditing && !isGuest && (
        <div className="card p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Edit Profile</h2>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label htmlFor="edit-username" className="block text-sm font-medium text-arena-300 mb-1">
                Username
              </label>
              <input
                type="text"
                id="edit-username"
                value={profileForm.values.username}
                onChange={(e) => profileForm.handleChange('username', e.target.value)}
                onBlur={() => profileForm.handleBlur('username')}
                className={`input-field w-full ${
                  profileForm.formValidation.username.isTouched && profileForm.formValidation.username.error
                    ? 'border-red-500'
                    : ''
                }`}
              />
              {profileForm.formValidation.username.isTouched && profileForm.formValidation.username.error && (
                <p className="mt-1 text-sm text-red-400">{profileForm.formValidation.username.error}</p>
              )}
            </div>

            <div>
              <label htmlFor="edit-email" className="block text-sm font-medium text-arena-300 mb-1">
                Email
              </label>
              <input
                type="email"
                id="edit-email"
                value={profileForm.values.email}
                onChange={(e) => profileForm.handleChange('email', e.target.value)}
                onBlur={() => profileForm.handleBlur('email')}
                className={`input-field w-full ${
                  profileForm.formValidation.email.isTouched && profileForm.formValidation.email.error
                    ? 'border-red-500'
                    : ''
                }`}
              />
              {profileForm.formValidation.email.isTouched && profileForm.formValidation.email.error && (
                <p className="mt-1 text-sm text-red-400">{profileForm.formValidation.email.error}</p>
              )}
            </div>

            <div className="flex gap-3">
              <LoadingButton
                type="submit"
                isLoading={isLoading}
                disabled={!profileForm.isFormValid}
                className="btn-primary px-4 py-2"
              >
                Save Changes
              </LoadingButton>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="btn-secondary px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Change Password Form */}
      {showChangePassword && !isGuest && (
        <div className="card p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Change Password</h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label htmlFor="current-password" className="block text-sm font-medium text-arena-300 mb-1">
                Current Password
              </label>
              <input
                type="password"
                id="current-password"
                value={passwordForm.values.currentPassword}
                onChange={(e) => passwordForm.handleChange('currentPassword', e.target.value)}
                onBlur={() => passwordForm.handleBlur('currentPassword')}
                className={`input-field w-full ${
                  passwordForm.formValidation.currentPassword.isTouched && passwordForm.formValidation.currentPassword.error
                    ? 'border-red-500'
                    : ''
                }`}
              />
              {passwordForm.formValidation.currentPassword.isTouched && passwordForm.formValidation.currentPassword.error && (
                <p className="mt-1 text-sm text-red-400">{passwordForm.formValidation.currentPassword.error}</p>
              )}
            </div>

            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-arena-300 mb-1">
                New Password
              </label>
              <input
                type="password"
                id="new-password"
                value={passwordForm.values.newPassword}
                onChange={(e) => passwordForm.handleChange('newPassword', e.target.value)}
                onBlur={() => passwordForm.handleBlur('newPassword')}
                className={`input-field w-full ${
                  passwordForm.formValidation.newPassword.isTouched && passwordForm.formValidation.newPassword.error
                    ? 'border-red-500'
                    : ''
                }`}
              />
              {passwordForm.formValidation.newPassword.isTouched && passwordForm.formValidation.newPassword.error && (
                <p className="mt-1 text-sm text-red-400">{passwordForm.formValidation.newPassword.error}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirm-new-password" className="block text-sm font-medium text-arena-300 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                id="confirm-new-password"
                value={passwordForm.values.confirmPassword}
                onChange={(e) => passwordForm.handleChange('confirmPassword', e.target.value)}
                onBlur={() => passwordForm.handleBlur('confirmPassword')}
                className={`input-field w-full ${
                  passwordForm.formValidation.confirmPassword.isTouched && passwordForm.formValidation.confirmPassword.error
                    ? 'border-red-500'
                    : ''
                }`}
              />
              {passwordForm.formValidation.confirmPassword.isTouched && passwordForm.formValidation.confirmPassword.error && (
                <p className="mt-1 text-sm text-red-400">{passwordForm.formValidation.confirmPassword.error}</p>
              )}
            </div>

            <div className="flex gap-3">
              <LoadingButton
                type="submit"
                isLoading={isLoading}
                disabled={!passwordForm.isFormValid}
                className="btn-primary px-4 py-2"
              >
                Change Password
              </LoadingButton>
              <button
                type="button"
                onClick={() => setShowChangePassword(false)}
                className="btn-secondary px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Guest Account Notice */}
      {isGuest && (
        <div className="card p-6 border-yellow-600">
          <div className="flex items-start space-x-3">
            <svg className="w-6 h-6 text-yellow-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <h3 className="text-yellow-500 font-semibold mb-2">Guest Account Limitations</h3>
              <ul className="text-arena-300 text-sm space-y-1">
                <li>• Progress and statistics are not saved</li>
                <li>• Limited customization options</li>
                <li>• Session ends when you close the browser</li>
              </ul>
              <div className="mt-4">
                <a href="/auth" className="btn-primary px-4 py-2 text-sm">
                  Create Account to Save Progress
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}