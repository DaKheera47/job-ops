import { describe, expect, it } from "vitest";
import { parseFiveamsatServices } from "../src/parser";

describe("parseFiveamsatServices", () => {
  it("maps Arabic service cards into freelance job inputs", () => {
    const jobs = parseFiveamsatServices(`
      <section>
        <article class="service-card" data-service-id="123">
          <h3><a href="/services/programming/123-%D8%A8%D8%B1%D9%85%D8%AC%D8%A9">برمجة إضافة ووردبريس</a></h3>
          <a class="seller" href="/user/ahmed">أحمد محمد</a>
          <p class="description">سأقوم ببناء إضافة ووردبريس باحترافية</p>
          <span class="price">$25</span>
        </article>
      </section>
    `);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual(
      expect.objectContaining({
        source: "fiveamsat",
        title: "برمجة إضافة ووردبريس",
        employer: "أحمد محمد",
        jobUrl:
          "https://khamsat.com/services/programming/123-%D8%A8%D8%B1%D9%85%D8%AC%D8%A9",
        salary: "$25",
        jobDescription: "سأقوم ببناء إضافة ووردبريس باحترافية",
        jobType: "Freelance / Project",
      }),
    );
  });

  it("normalizes relative URLs and falls back to a default seller", () => {
    const jobs = parseFiveamsatServices(`
      <div class="service">
        <a href="/services/design/logo">Logo design</a>
        <span class="price">10 دولار</span>
      </div>
    `);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.jobUrl).toBe("https://khamsat.com/services/design/logo");
    expect(jobs[0]?.employer).toBe("Khamsat Seller");
    expect(jobs[0]?.salary).toBe("10 دولار");
  });

  it("skips malformed cards silently", () => {
    const jobs = parseFiveamsatServices(`
      <article class="service-card"><a href="/user/ali">Ali</a></article>
      <article class="service-card">
        <a href="/services/writing/article">Article writing</a>
      </article>
    `);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe("Article writing");
  });
});
