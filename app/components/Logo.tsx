'use client';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'icon' | 'text';
  className?: string;
}

export function Logo({ size = 'md', variant = 'full', className = '' }: LogoProps) {
  const sizeClasses = {
    sm: 'h-6',
    md: 'h-8', 
    lg: 'h-12',
    xl: 'h-16'
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-3xl', 
    xl: 'text-5xl'
  };

  // Duration Orange color scheme
  const orangeGradient = 'bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600';
  const orangeText = 'text-transparent bg-clip-text';

  if (variant === 'icon') {
    return (
      <div className={`${sizeClasses[size]} ${className} flex items-center justify-center`}>
        <div className={`${orangeGradient} ${orangeText} font-bold ${textSizes[size]} leading-none`}>
          D
        </div>
      </div>
    );
  }

  if (variant === 'text') {
    return (
      <div className={`${className} flex items-center`}>
        <span className={`${orangeGradient} ${orangeText} font-bold ${textSizes[size]} leading-none`}>
          uration
        </span>
      </div>
    );
  }

  return (
    <div className={`${className} flex items-center space-x-1`}>
      <div className={`${orangeGradient} ${orangeText} font-bold ${textSizes[size]} leading-none tracking-tight`}>
        Duration
      </div>
    </div>
  );
}

interface BrandedHeaderProps {
  title?: string;
  subtitle?: string;
  className?: string;
}

export function BrandedHeader({ title, subtitle, className = '' }: BrandedHeaderProps) {
  return (
    <div className={`text-center mb-8 ${className}`}>
      <div className="flex items-center justify-center mb-4">
        <Logo size="xl" />
      </div>
      {title && (
        <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
      )}
      {subtitle && (
        <p className="text-lg text-purple-200 opacity-90">{subtitle}</p>
      )}
    </div>
  );
}

interface NavigationLogoProps {
  className?: string;
  showText?: boolean;
}

export function NavigationLogo({ className = '', showText = true }: NavigationLogoProps) {
  return (
    <div className={`flex items-center ${className}`}>
      {showText ? (
        <Logo variant="full" size="md" />
      ) : (
        <Logo variant="icon" size="md" />
      )}
    </div>
  );
}

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function DurationSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-6 h-6 text-sm',
    md: 'w-8 h-8 text-lg',
    lg: 'w-12 h-12 text-2xl'
  };

  return (
    <div className={`${sizeClasses[size]} ${className} flex items-center justify-center`}>
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600 text-transparent bg-clip-text font-bold animate-pulse">
          D
        </div>
        <div className="bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600 text-transparent bg-clip-text font-bold animate-spin">
          D
        </div>
      </div>
    </div>
  );
}