import confetti from "canvas-confetti";

/**
 * Triggers a beautiful congratulatory celebration on the screen,
 * combining a central confetti burst with rising balloon-like shapes.
 */
export function celebrateOffer() {
  // 1. Primary confetti burst from the middle/bottom area
  confetti({
    particleCount: 140,
    spread: 90,
    origin: { y: 0.6 },
    zIndex: 999999,
    colors: ["#10b981", "#34d399", "#6ee7b7", "#3b82f6", "#f59e0b", "#ec4899", "#a855f7"],
  });

  // 2. Balloons floating up from the bottom of the viewport
  const duration = 3000;
  const animationEnd = Date.now() + duration;

  // Create native balloon emoji shape
  const balloonEmoji = confetti.shapeFromText({ text: "🎈", scalar: 2.2 });

  const interval = setInterval(() => {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      clearInterval(interval);
      return;
    }

    const useEmoji = Math.random() > 0.6; // 40% chance of emoji balloon, 60% chance of colored circle

    // Launch a balloon from a random horizontal position at the bottom of the screen
    confetti({
      particleCount: 1,
      startVelocity: Math.random() * 5 + 6, // Gentle initial upward velocity
      angle: 90, // Directs the velocity straight up
      ticks: 450, // Long life to ensure they float off the top of the screen
      origin: {
        x: Math.random(),
        y: 1.02, // Start just below the visible screen edge
      },
      gravity: -0.65, // Float upwards (negative gravity)
      drift: (Math.random() - 0.5) * 1.0, // Gentle side-to-side sway
      flat: true, // Turn off tilt and wobble so they stay round/vertical
      shapes: useEmoji ? [balloonEmoji] : ["circle"],
      scalar: Math.random() * 1.5 + 2.0, // Large balloon size
      zIndex: 999999,
      colors: [
        "#3b82f6", // Blue
        "#ef4444", // Red
        "#10b981", // Green
        "#f59e0b", // Amber
        "#ec4899", // Pink
        "#8b5cf6", // Purple
        "#06b6d4", // Cyan
      ],
    });
  }, 60);
}
