import Image from "next/image";

interface TeamiesLogoProps {
  /**
   * - "auto": Responsive switcher (icon-only on mobile < sm, horizontal on desktop >= sm)
   * - "horizontal": Always renders the primary horizontal logo (mark + wordmark)
   * - "icon": Always renders the icon-only squircle logo
   */
  variant?: "auto" | "horizontal" | "icon";
  /** Size preset */
  size?: "sm" | "md" | "lg";
  /** Set to true when rendered in above-the-fold headers */
  priority?: boolean;
  className?: string;
}

export function TeamiesLogo({
  variant = "auto",
  size = "md",
  priority = false,
  className = "",
}: TeamiesLogoProps) {
  // Sizing configurations
  const horizontalSizes = {
    sm: { width: 85, height: 25, imgClass: "h-6 w-auto" },
    md: { width: 106, height: 31, imgClass: "h-7 sm:h-[30px] w-auto" },
    lg: { width: 136, height: 40, imgClass: "h-10 w-auto" },
  };

  const iconSizes = {
    sm: { size: 26, imgClass: "h-[26px] w-[26px]" },
    md: { size: 32, imgClass: "h-8 w-8" },
    lg: { size: 40, imgClass: "h-10 w-10" },
  };

  const hConfig = horizontalSizes[size];
  const iConfig = iconSizes[size];

  // The approved logo uses a #17181A dark background.
  // In light mode, this pill container ensures the approved dark artwork
  // stays visually correct without recoloring, filters, or rectangular clipping.
  // In dark mode, #17181A seamlessly matches the dark theme background.
  const containerClasses =
    "inline-flex items-center justify-center rounded-lg bg-[#17181A] px-2 py-1 border border-[#2B2D31]/50 shadow-xs transition-opacity hover:opacity-95";

  if (variant === "horizontal") {
    return (
      <span className={`${containerClasses} ${className}`}>
        <Image
          src="/brand/teamies-logo.png"
          alt="Teamies"
          width={hConfig.width}
          height={hConfig.height}
          priority={priority}
          className={`${hConfig.imgClass} object-contain rounded`}
        />
      </span>
    );
  }

  if (variant === "icon") {
    return (
      <span className={`inline-flex items-center justify-center ${className}`}>
        <Image
          src="/brand/teamies-icon.png"
          alt="Teamies"
          width={iConfig.size}
          height={iConfig.size}
          priority={priority}
          className={`${iConfig.imgClass} object-contain rounded-lg border border-[#2B2D31]/40 shadow-xs`}
        />
      </span>
    );
  }

  // variant === "auto" (Responsive: Icon on mobile, horizontal on desktop)
  return (
    <span className={`inline-flex items-center ${className}`}>
      {/* Mobile view (< sm) */}
      <span className="inline-flex sm:hidden items-center justify-center">
        <Image
          src="/brand/teamies-icon.png"
          alt="Teamies"
          width={iConfig.size}
          height={iConfig.size}
          priority={priority}
          className={`${iConfig.imgClass} object-contain rounded-lg border border-[#2B2D31]/40 shadow-xs`}
        />
      </span>

      {/* Desktop view (>= sm) */}
      <span className={`hidden sm:inline-flex ${containerClasses}`}>
        <Image
          src="/brand/teamies-logo.png"
          alt="Teamies"
          width={hConfig.width}
          height={hConfig.height}
          priority={priority}
          className={`${hConfig.imgClass} object-contain rounded`}
        />
      </span>
    </span>
  );
}

