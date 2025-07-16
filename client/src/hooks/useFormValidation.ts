import { useState, useCallback, useMemo } from 'react';
import { AuthService } from '../services/authService';

export interface ValidationRule {
  test: (value: string) => boolean;
  message: string;
}

export interface FieldValidation {
  value: string;
  error: string | null;
  isValid: boolean;
  isTouched: boolean;
}

export interface FormValidation {
  [key: string]: FieldValidation;
}

export interface UseFormValidationProps {
  initialValues: Record<string, string>;
  validationRules: Record<string, ValidationRule[]>;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
}

export function useFormValidation({
  initialValues,
  validationRules,
  validateOnChange = true,
  validateOnBlur = true,
}: UseFormValidationProps) {
  const [values, setValues] = useState(initialValues);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  // Validate a single field
  const validateField = useCallback(
    (fieldName: string, value: string): string | null => {
      const rules = validationRules[fieldName];
      if (!rules) return null;

      // Special handling for confirmPassword field
      if (fieldName === 'confirmPassword') {
        for (const rule of rules) {
          if (rule.message === 'Passwords do not match') {
            // Compare with the current password value
            if (value !== values.password) {
              return rule.message;
            }
          } else if (!rule.test(value)) {
            return rule.message;
          }
        }
        return null;
      }

      for (const rule of rules) {
        if (!rule.test(value)) {
          return rule.message;
        }
      }
      return null;
    },
    [validationRules, values]
  );

  // Validate all fields
  const validateAll = useCallback((): boolean => {
    const newErrors: Record<string, string | null> = {};
    let isValid = true;

    for (const fieldName of Object.keys(validationRules)) {
      const error = validateField(fieldName, values[fieldName] || '');
      newErrors[fieldName] = error;
      if (error) isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  }, [values, validateField, validationRules]);

  // Handle input change
  const handleChange = useCallback(
    (fieldName: string, value: string) => {
      setValues((prev) => ({ ...prev, [fieldName]: value }));

      if (validateOnChange) {
        const error = validateField(fieldName, value);
        setErrors((prev) => ({ ...prev, [fieldName]: error }));
        
        // If password field changes, also re-validate confirmPassword
        if (fieldName === 'password' && values.confirmPassword) {
          const confirmPasswordError = validateField('confirmPassword', values.confirmPassword);
          setErrors((prev) => ({ ...prev, confirmPassword: confirmPasswordError }));
        }
      }
    },
    [validateField, validateOnChange, values.confirmPassword]
  );

  // Handle input blur
  const handleBlur = useCallback(
    (fieldName: string) => {
      setTouched((prev) => ({ ...prev, [fieldName]: true }));

      if (validateOnBlur) {
        const error = validateField(fieldName, values[fieldName] || '');
        setErrors((prev) => ({ ...prev, [fieldName]: error }));
      }
    },
    [validateField, validateOnBlur, values]
  );

  // Reset form
  const reset = useCallback(() => {
    setValues(initialValues);
    setTouched({});
    setErrors({});
  }, [initialValues]);

  // Get form validation state
  const formValidation = useMemo((): FormValidation => {
    const result: FormValidation = {};

    for (const fieldName of Object.keys(validationRules)) {
      result[fieldName] = {
        value: values[fieldName] || '',
        error: errors[fieldName],
        isValid: !errors[fieldName],
        isTouched: touched[fieldName] || false,
      };
    }

    return result;
  }, [values, errors, touched, validationRules]);

  const isFormValid = useMemo(() => {
    return Object.values(formValidation).every((field) => field.isValid);
  }, [formValidation]);

  const hasErrors = useMemo(() => {
    return Object.values(errors).some((error) => error !== null);
  }, [errors]);

  return {
    values,
    errors,
    touched,
    formValidation,
    isFormValid,
    hasErrors,
    handleChange,
    handleBlur,
    validateAll,
    reset,
  };
}

// Common validation rules
export const validationRules = {
  required: (message = 'This field is required'): ValidationRule => ({
    test: (value: string) => value.trim().length > 0,
    message,
  }),

  minLength: (min: number, message?: string): ValidationRule => ({
    test: (value: string) => value.length >= min,
    message: message || `Must be at least ${min} characters long`,
  }),

  maxLength: (max: number, message?: string): ValidationRule => ({
    test: (value: string) => value.length <= max,
    message: message || `Must be no more than ${max} characters long`,
  }),

  email: (message = 'Please enter a valid email address'): ValidationRule => ({
    test: (value: string) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value);
    },
    message,
  }),

  username: (message = 'Username must be 3-20 characters and contain only letters, numbers, and underscores'): ValidationRule => ({
    test: (value: string) => {
      const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
      return usernameRegex.test(value);
    },
    message,
  }),

  password: (message = 'Password must be at least 8 characters with uppercase, lowercase, and number'): ValidationRule => ({
    test: (value: string) => {
      const validation = AuthService.validatePassword(value);
      return validation.isValid;
    },
    message,
  }),

  confirmPassword: (originalPassword: string, message = 'Passwords do not match'): ValidationRule => ({
    test: (value: string) => value === originalPassword,
    message,
  }),

  pattern: (regex: RegExp, message: string): ValidationRule => ({
    test: (value: string) => regex.test(value),
    message,
  }),
};

// Hook for password strength checking
export function usePasswordStrength(password: string) {
  return useMemo(() => {
    if (!password) {
      return {
        score: 0,
        strength: 'None' as const,
        feedback: [],
        color: 'bg-gray-300',
      };
    }

    const validation = AuthService.validatePassword(password);
    
    const strengthLevels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;
    const colors = [
      'bg-red-500',
      'bg-orange-500', 
      'bg-yellow-500',
      'bg-blue-500',
      'bg-green-500',
    ];

    return {
      score: validation.score,
      strength: strengthLevels[validation.score] || 'Very Weak',
      feedback: validation.feedback,
      color: colors[validation.score] || colors[0],
      isValid: validation.isValid,
    };
  }, [password]);
}