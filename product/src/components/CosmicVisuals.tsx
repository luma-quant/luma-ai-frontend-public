import apiClient from '@/src/api/apiClient';
import React from 'react';

export function QuantumLogo({ className = 'w-10 h-10', glowing = false }: { className?: string; glowing?: boolean }) {
  const [imageError, setImageError] = React.useState(false);

  if (!imageError) {
    return (
      <img 
        src="/logo-1.webp" 
        className={`${className} object-contain ${glowing ? 'filter drop-shadow-[0_0_8px_rgba(0,240,255,0.6)] animate-glow-pulse' : ''}`}
        onError={() => setImageError(true)}
        alt="Luma Logo"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <svg 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={`${className} ${glowing ? 'filter drop-shadow-[0_0_8px_rgba(0,240,255,0.6)]' : ''}`}
    >
      {/* Outer sharp circle */}
      <circle cx="50" cy="50" r="44" stroke="url(#logoGrad)" strokeWidth="3.5" />
      
      {/* The 5 slanted pills/stripe elements from Image 3 */}
      {/* 1. Top left slanted pill */}
      <rect x="35" y="24" width="36" height="10" rx="5" transform="rotate(-30, 35, 24)" fill="url(#logoGrad)" />
      
      {/* 2. Left floating circular dot */}
      
      {/* 3. Bottom left slanted pill */}
      <rect x="31" y="63" width="28" height="9" rx="4.5" transform="rotate(-18, 31, 63)" fill="url(#logoGrad)" />
      
      {/* 4. Bottom right angled long pill */}
      <rect x="44" y="55" width="37" height="10" rx="5" transform="rotate(-40, 44, 55)" fill="url(#logoGrad)" />
      
      {/* 5. Top right slanted vertical pill */}
      <rect x="62" y="28" width="32" height="9" rx="4.5" transform="rotate(78, 62, 28)" fill="url(#logoGrad)" />

      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00f0ff" />
          <stop offset="50%" stopColor="#9d4edd" />
          <stop offset="100%" stopColor="#ff007f" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function CreditCrystal({ className = 'w-6 h-6', glowing = true }: { className?: string; glowing?: boolean }) {
  const [imgSrc, setImgSrc] = React.useState<string | null>('/credits.webp');

  if (imgSrc) {
    return (
      <img 
        src={imgSrc} 
        className={`${className} object-contain ${glowing ? 'filter drop-shadow-[0_0_8px_rgba(255,0,127,0.55)]' : ''}`}
        onError={() => {
          setImgSrc(null);
        }}
        alt="CR"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <svg 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={`${className} ${glowing ? 'filter drop-shadow-[0_0_8px_rgba(255,0,127,0.55)]' : ''}`}
    >
      {/* Crystal polygon structures based on Image 2 */}
      <polygon points="50,5 20,20 50,45" fill="url(#gemCyan)" />
      <polygon points="20,20 10,55 50,45" fill="url(#gemTeal)" />
      <polygon points="10,55 35,90 50,45" fill="url(#gemBlue)" />
      <polygon points="35,90 75,90 50,45" fill="url(#gemPurple)" />
      <polygon points="75,90 90,55 50,45" fill="url(#gemMagenta)" />
      <polygon points="90,55 80,20 50,45" fill="url(#gemFuchsia)" />
      <polygon points="80,20 50,5 50,45" fill="url(#gemBrightCosmic)" />

      {/* Glowing highlighting overlays */}
      <polygon points="50,5 52,5 50,45" fill="#ffffff" opacity="0.45" />
      <polygon points="80,20 81,21 50,45" fill="#ffffff" opacity="0.3" />

      {/* Outer borders */}
      <polygon 
        points="50,5 20,20 10,55 35,90 75,90 90,55 80,20" 
        stroke="url(#logoGrad)" 
        strokeWidth="2" 
        strokeLinejoin="round" 
        opacity="0.5" 
      />
      
      <defs>
        <linearGradient id="gemCyan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a3f5ff" />
          <stop offset="100%" stopColor="#00b4d8" />
        </linearGradient>
        <linearGradient id="gemTeal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00b4d8" />
          <stop offset="100%" stopColor="#005d9a" />
        </linearGradient>
        <linearGradient id="gemBlue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#005d9a" />
          <stop offset="100%" stopColor="#060416" />
        </linearGradient>
        <linearGradient id="gemPurple" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7a1fa2" />
          <stop offset="100%" stopColor="#310052" />
        </linearGradient>
        <linearGradient id="gemMagenta" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff007f" />
          <stop offset="100%" stopColor="#7a1fa2" />
        </linearGradient>
        <linearGradient id="gemFuchsia" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff85b3" />
          <stop offset="100%" stopColor="#ff007f" />
        </linearGradient>
        <linearGradient id="gemBrightCosmic" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff007f" />
          <stop offset="100%" stopColor="#00f0ff" />
        </linearGradient>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00f0ff" />
          <stop offset="50%" stopColor="#9d4edd" />
          <stop offset="100%" stopColor="#ff007f" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function CrateContainer({ className = 'w-48 h-48', logoGlowing = true, imageSrc }: { className?: string; logoGlowing?: boolean; imageSrc?: string }) {
  const configuredImage = imageSrc || '/pack_open.webp';
  const [failedImage, setFailedImage] = React.useState<string | null>(null);
  const imgSrc = failedImage === configuredImage ? null : configuredImage;

  React.useEffect(() => {
    setFailedImage(null);
  }, [configuredImage]);

  if (imgSrc) {
    return (
      <div className={`relative ${className} flex items-center justify-center filter drop-shadow-[0_0_20px_rgba(0,140,255,0.3)] select-none`} id="image-loot-crate">
        <img 
          src={imgSrc} 
          className="w-full h-full object-contain animate-float"
          onError={() => setFailedImage(configuredImage)}
          alt="Luma Crate"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return (
    <div className={`relative ${className} flex items-center justify-center filter drop-shadow-[0_0_20px_rgba(0,140,255,0.3)] select-none`} id="custom-loot-crate-element">
      {/* Clean isometric-look vector panel from Image 4 */}
      <svg viewBox="0 0 200 200" fill="none" className="w-full h-full animate-float">
        {/* Floor ambient occlusion glass shadow */}
        <ellipse cx="100" cy="182" rx="55" ry="9" fill="rgba(0,0,0,0.65)" className="filter blur-md" />
        
        {/* Outer Heavy Beveled Carbon Alloy Shell */}
        {/* Corners are beautifully notched */}
        <path d="M42,25 L158,25 L180,47 L180,153 L158,175 L42,175 L20,153 L20,47 Z" fill="url(#crateArmorShadow)" />
        <path d="M44,28 L156,28 L176,48 L176,152 L156,172 L44,172 L24,152 L24,48 Z" fill="url(#crateArmor)" stroke="url(#crateNeonBorders)" strokeWidth="3" />

        {/* Side Cyan/Magenta Neo-Alloy guards */}
        {/* Left glowing handle in bright cyan */}
        <path d="M24,47 L14,57 L14,143 L24,153" stroke="#00f0ff" strokeWidth="4.5" strokeLinecap="round" className="filter drop-shadow-[0_0_5px_rgba(0,240,255,0.7)]" />
        {/* Right glowing handle in bright fuchsia */}
        <path d="M176,47 L186,57 L186,143 L176,153" stroke="#ff007f" strokeWidth="4.5" strokeLinecap="round" className="filter drop-shadow-[0_0_5px_rgba(255,0,127,0.7)]" />

        {/* Inner Dark Bezel plate */}
        <polygon points="52,52 148,52 168,72 168,128 148,148 52,148 32,128 32,72" fill="#040410" stroke="url(#crateNeonBorders)" strokeWidth="1.5" />
        
        {/* Tech Screw details in corners */}
        <circle cx="50" cy="38" r="3" fill="#0c0a20" stroke="#00f0ff" strokeWidth="1" />
        <circle cx="150" cy="38" r="3" fill="#0c0a20" stroke="#ff007f" strokeWidth="1" />
        <circle cx="50" cy="162" r="3" fill="#0c0a20" stroke="#00f0ff" strokeWidth="1" />
        <circle cx="150" cy="162" r="3" fill="#0c0a20" stroke="#ff007f" strokeWidth="1" />

        {/* Central glowing reactor circle */}
        <circle cx="100" cy="100" r="39" fill="url(#crateCentralGlow)" stroke="#00f0ff" strokeWidth="1" opacity="0.85" />

        <defs>
          <linearGradient id="crateArmor" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1e203c" />
            <stop offset="40%" stopColor="#080816" />
            <stop offset="100%" stopColor="#100b2a" />
          </linearGradient>
          <linearGradient id="crateArmorShadow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2c3258" />
            <stop offset="100%" stopColor="#010105" />
          </linearGradient>
          <linearGradient id="crateNeonBorders" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f0ff" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#ff007f" />
          </linearGradient>
          <radialGradient id="crateCentralGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff007f" stopOpacity="0.45" />
            <stop offset="45%" stopColor="#9d4edd" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#040410" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
      
      {/* Placed centered QuantumLogo */}
      <div className="absolute w-14 h-14 top-[calc(50%-28px)] left-[calc(50%-28px)] pointer-events-none">
        <QuantumLogo className="w-full h-full" glowing={logoGlowing} />
      </div>
    </div>
  );
}

export function BackgroundCosmos({ isLogged = false }: { isLogged?: boolean }) {
  const [imgSrc, setImgSrc] = React.useState<string | null>('/background_mobile.webp');

  // Update background when isLogged changes
  React.useEffect(() => {
    setImgSrc('/background_mobile.webp');
  }, [isLogged]);

  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden select-none" id="luma-cosmos-backdrop">
      {/* If we have the image background, render it as absolute background */}
      {imgSrc && (
        <img 
          src={imgSrc} 
          className="absolute inset-0 w-full h-full object-cover opacity-100"
          onError={() => {
            setImgSrc(null); // fallback
          }}
          alt="Space Bg"
          referrerPolicy="no-referrer"
        />
      )}

      {/* Core background black/indigo canvas */}
      <div className="absolute inset-0 bg-transparent -z-10" />
      
      {/* Gentle twinkling stars - clean & sparse */}
      <div className="absolute inset-0">
        <div className="absolute top-[15%] left-[25%] w-1 h-1 bg-white rounded-full opacity-60" style={{ animation: 'star-twinkle 6s infinite ease-in-out' }} />
        <div className="absolute top-[40%] left-[83%] w-1 h-1 bg-cyan-300 rounded-full opacity-40" style={{ animation: 'star-twinkle 5s infinite ease-in-out 1s' }} />
        <div className="absolute top-[60%] left-[68%] w-1.5 h-1.5 bg-white rounded-full opacity-70" style={{ animation: 'star-twinkle 7s infinite ease-in-out 2s' }} />
        <div className="absolute top-[28%] left-[45%] w-1 h-1 bg-blue-300 rounded-full opacity-50" style={{ animation: 'star-twinkle 9s infinite ease-in-out 4s' }} />
        <div className="absolute top-[85%] left-[48%] w-1 h-1 bg-white rounded-full opacity-30" style={{ animation: 'star-twinkle 4s infinite ease-in-out 0.5s' }} />
      </div>
    </div>
  );
}
