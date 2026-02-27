import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="form-label">
            {label}
            {props.required && <span className="text-red-600 ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          className={`form-input ${error ? 'border-red-600' : ''} ${className}`}
          {...props}
        />
        {error && <p className="form-error">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'

