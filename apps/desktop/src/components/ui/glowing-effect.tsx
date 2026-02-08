import { cn } from '@/lib/utils';
import { animate } from 'motion/react';
import { memo, useCallback, useEffect, useRef } from 'react';

interface GlowingEffectProps {
  blur?: number;
  inactiveZone?: number;
  proximity?: number;
  spread?: number;
  variant?: 'default' | 'white';
  glow?: boolean;
  className?: string;
  disabled?: boolean;
  movementDuration?: number;
  borderWidth?: number;
}

// Helper: Check if point is within inactive zone
function isInInactiveZone(
  mouseX: number,
  mouseY: number,
  center: [number, number],
  inactiveRadius: number
): boolean {
  const distanceFromCenter = Math.hypot(mouseX - center[0], mouseY - center[1]);
  return distanceFromCenter < inactiveRadius;
}

// Helper: Check if point is active (within proximity)
function isPointActive(
  mouseX: number,
  mouseY: number,
  bounds: { left: number; top: number; width: number; height: number },
  proximity: number
): boolean {
  return (
    mouseX > bounds.left - proximity &&
    mouseX < bounds.left + bounds.width + proximity &&
    mouseY > bounds.top - proximity &&
    mouseY < bounds.top + bounds.height + proximity
  );
}

// Helper: Calculate angle for glow effect
function calculateGlowAngle(
  mouseX: number,
  mouseY: number,
  center: [number, number],
  currentAngle: number
): number {
  const targetAngle = (180 * Math.atan2(mouseY - center[1], mouseX - center[0])) / Math.PI + 90;
  const angleDiff = ((targetAngle - currentAngle + 180) % 360) - 180;
  return currentAngle + angleDiff;
}

// Helper: Get gradient style based on variant
function getGradientStyle(variant: 'default' | 'white'): string {
  if (variant === 'white') {
    return `repeating-conic-gradient(
      from 236.84deg at 50% 50%,
      var(--black),
      var(--black) calc(25% / var(--repeating-conic-gradient-times))
    )`;
  }
  return `radial-gradient(circle, #dd7bbb 10%, #dd7bbb00 20%),
    radial-gradient(circle at 40% 40%, #d79f1e 5%, #d79f1e00 15%),
    radial-gradient(circle at 60% 60%, #5a922c 10%, #5a922c00 20%), 
    radial-gradient(circle at 40% 60%, #4c7894 10%, #4c789400 20%),
    repeating-conic-gradient(
      from 236.84deg at 50% 50%,
      #dd7bbb 0%,
      #d79f1e calc(25% / var(--repeating-conic-gradient-times)),
      #5a922c calc(50% / var(--repeating-conic-gradient-times)), 
      #4c7894 calc(75% / var(--repeating-conic-gradient-times)),
      #dd7bbb calc(100% / var(--repeating-conic-gradient-times))
    )`;
}

const GlowingEffect = memo(
  ({
    blur = 0,
    inactiveZone = 0.7,
    proximity = 0,
    spread = 20,
    variant = 'default',
    glow = false,
    className,
    movementDuration = 2,
    borderWidth = 1,
    disabled = true,
  }: GlowingEffectProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const lastPosition = useRef({ x: 0, y: 0 });
    const animationFrameRef = useRef<number>(0);

    // Process the glow effect animation for a given position
    const processGlowAnimation = useCallback(
      (element: HTMLDivElement, mouseX: number, mouseY: number) => {
        const bounds = element.getBoundingClientRect();
        const center: [number, number] = [
          bounds.left + bounds.width * 0.5,
          bounds.top + bounds.height * 0.5,
        ];
        const inactiveRadius = 0.5 * Math.min(bounds.width, bounds.height) * inactiveZone;

        // Check inactive zone
        if (isInInactiveZone(mouseX, mouseY, center, inactiveRadius)) {
          element.style.setProperty('--active', '0');
          return;
        }

        // Check if active
        const active = isPointActive(mouseX, mouseY, bounds, proximity);
        element.style.setProperty('--active', active ? '1' : '0');
        if (!active) return;

        // Animate angle
        const currentAngle = Number.parseFloat(element.style.getPropertyValue('--start')) || 0;
        const newAngle = calculateGlowAngle(mouseX, mouseY, center, currentAngle);

        animate(currentAngle, newAngle, {
          duration: movementDuration,
          ease: [0.16, 1, 0.3, 1],
          onUpdate: (value) => {
            element.style.setProperty('--start', String(value));
          },
        });
      },
      [inactiveZone, proximity, movementDuration]
    );

    const handleMove = useCallback(
      (e?: MouseEvent | { x: number; y: number }) => {
        if (!containerRef.current) return;

        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        animationFrameRef.current = requestAnimationFrame(() => {
          const element = containerRef.current;
          if (!element) return;

          const mouseX = e?.x ?? lastPosition.current.x;
          const mouseY = e?.y ?? lastPosition.current.y;

          if (e) {
            lastPosition.current = { x: mouseX, y: mouseY };
          }

          processGlowAnimation(element, mouseX, mouseY);
        });
      },
      [processGlowAnimation]
    );

    useEffect(() => {
      if (disabled) return;

      const handleScroll = () => handleMove();
      const handlePointerMove = (e: PointerEvent) => handleMove(e);

      window.addEventListener('scroll', handleScroll, { passive: true });
      document.body.addEventListener('pointermove', handlePointerMove, {
        passive: true,
      });

      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        window.removeEventListener('scroll', handleScroll);
        document.body.removeEventListener('pointermove', handlePointerMove);
      };
    }, [handleMove, disabled]);

    return (
      <>
        <div
          className={cn(
            'pointer-events-none absolute -inset-px hidden rounded-[inherit] border opacity-0 transition-opacity',
            glow && 'opacity-100',
            variant === 'white' && 'border-white',
            disabled && '!block'
          )}
        />
        <div
          ref={containerRef}
          style={
            {
              '--blur': `${blur}px`,
              '--spread': spread,
              '--start': '0',
              '--active': '0',
              '--glowingeffect-border-width': `${borderWidth}px`,
              '--repeating-conic-gradient-times': '5',
              '--gradient': getGradientStyle(variant),
            } as React.CSSProperties
          }
          className={cn(
            'pointer-events-none absolute inset-0 rounded-[inherit] opacity-100 transition-opacity',
            glow && 'opacity-100',
            blur > 0 && 'blur-[var(--blur)] ',
            className,
            disabled && '!hidden'
          )}
        >
          <div
            className={cn(
              'glow',
              'rounded-[inherit]',
              'after:content-[""] after:rounded-[inherit] after:absolute after:inset-[calc(-1*var(--glowingeffect-border-width))]',
              'after:[border:var(--glowingeffect-border-width)_solid_transparent]',
              'after:[background:var(--gradient)] after:[background-attachment:fixed]',
              'after:opacity-[var(--active)] after:transition-opacity after:duration-300',
              'after:[mask-clip:padding-box,border-box]',
              'after:[mask-composite:intersect]',
              'after:[mask-image:linear-gradient(#0000,#0000),conic-gradient(from_calc((var(--start)-var(--spread))*1deg),#00000000_0deg,#fff,#00000000_calc(var(--spread)*2deg))]'
            )}
          />
        </div>
      </>
    );
  }
);

GlowingEffect.displayName = 'GlowingEffect';

export { GlowingEffect };
