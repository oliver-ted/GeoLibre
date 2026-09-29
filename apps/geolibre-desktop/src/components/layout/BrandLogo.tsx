import { cn } from "@geolibre/ui";

/** Product name shown in the toolbar, the About dialog, and the browser tab. */
export const PRODUCT_NAME = "Geoverse";

const asset = (file: string) => `${import.meta.env.BASE_URL}${file}`;

interface BrandLogoProps {
  className?: string;
}

/**
 * The Aether AI mark. The black and white variants swap with the app theme
 * (Tailwind's class-based `dark` mode) so the mark stays legible on either
 * background. Decorative: the adjacent product name carries the label.
 */
export function BrandMark({ className }: BrandLogoProps) {
  return (
    <>
      <img
        src={asset("aether-ai-mark-black.png")}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn("shrink-0 object-contain dark:hidden", className)}
      />
      <img
        src={asset("aether-ai-mark-white.png")}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn("hidden shrink-0 object-contain dark:block", className)}
      />
    </>
  );
}

/** The full Aether AI wordmark (mark + name), theme-aware like {@link BrandMark}. */
export function BrandWordmark({ className }: BrandLogoProps) {
  return (
    <>
      <img
        src={asset("aether-ai-logo-black.png")}
        alt="Aether AI"
        draggable={false}
        className={cn("w-auto object-contain dark:hidden", className)}
      />
      <img
        src={asset("aether-ai-logo-white.png")}
        alt="Aether AI"
        draggable={false}
        className={cn("hidden w-auto object-contain dark:block", className)}
      />
    </>
  );
}
