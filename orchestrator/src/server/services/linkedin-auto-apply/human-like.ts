import type { Locator, Page } from "playwright";

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, randomInt(minMs, maxMs)),
  );
}

export async function humanScroll(page: Page): Promise<void> {
  const amount = randomInt(100, 400);
  await page.mouse.wheel(0, amount);
  await randomDelay(300, 800);
}

export async function humanClick(
  page: Page,
  locator: Locator,
): Promise<void> {
  const box = await locator.boundingBox();
  if (box) {
    const x = box.x + box.width / 2 + randomInt(-3, 3);
    const y = box.y + box.height / 2 + randomInt(-3, 3);
    await page.mouse.move(x, y, { steps: randomInt(5, 15) });
    await randomDelay(100, 300);
  }
  await locator.click();
}

export async function humanType(
  page: Page,
  locator: Locator,
  text: string,
): Promise<void> {
  await locator.click();
  await randomDelay(200, 500);
  for (const char of text) {
    await page.keyboard.type(char, { delay: randomInt(30, 120) });
  }
}
