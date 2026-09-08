import { describe, expect, it } from "vitest";

import { hasActiveContent, sanitizeSvg } from "./svg-sanitize";

const clean = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#d4af37"/></svg>`;

/** Narrows the union so a test can read `.svg` without a cast every time. */
function scan(source: string) {
  const result = sanitizeSvg(source);
  if ("error" in result) throw new Error(`unexpectedly rejected: ${result.error}`);
  return result;
}

describe("a logo that is only a drawing", () => {
  it("passes through untouched", () => {
    const result = scan(clean);
    expect(result.removed).toEqual([]);
    expect(result.svg).toBe(clean);
  });
});

describe("active content is removed before anything is stored", () => {
  it("strips <script>", () => {
    const result = scan(`<svg><script>fetch('/api/files')</script><circle/></svg>`);
    expect(result.svg).not.toMatch(/script/i);
    expect(result.svg).toContain("<circle/>");
    expect(result.removed).toContain("תגיות <script>");
  });

  it("strips a <script> whose closing tag never arrives", () => {
    expect(scan(`<svg><script>alert(1)`).svg).not.toMatch(/alert/);
  });

  it("strips onload= and onerror=, quoted any way", () => {
    const result = scan(`<svg onload="steal()"><image onerror='go()' href="x"/><a onclick=go()></a></svg>`);
    expect(result.svg).not.toMatch(/onload|onerror|onclick/i);
  });

  it("strips <foreignObject>, which is arbitrary HTML in disguise", () => {
    const result = scan(`<svg><foreignObject><body><form action="/x"></form></body></foreignObject></svg>`);
    expect(result.svg).not.toMatch(/foreignObject|form/i);
  });

  it("strips javascript: wherever it appears", () => {
    expect(scan(`<svg><a xlink:href="javascript:alert(1)"><rect/></a></svg>`).svg).not.toMatch(
      /javascript:/i,
    );
  });

  it("strips a DOCTYPE, so entity expansion has nowhere to start", () => {
    const bomb = `<!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa">]><svg><text>&a;</text></svg>`;
    const result = scan(bomb);
    expect(result.svg).not.toMatch(/DOCTYPE|ENTITY/i);
  });

  it("strips a reference that would fetch from another server while it renders", () => {
    const result = scan(`<svg><image href="https://evil.example/pixel.png"/></svg>`);
    expect(result.svg).not.toContain("evil.example");
  });

  it("survives a tag hidden inside a tag — one pass would hand back a live one", () => {
    // Removing the inner <script> reconstitutes an outer one from the remains.
    const result = scan(`<svg><scr<script>ipt>alert(1)</script></svg>`);
    expect(result.svg).not.toMatch(/<script/i);
  });
});

describe("what is not an SVG at all", () => {
  it("is refused rather than sanitized into nothing", () => {
    expect(sanitizeSvg("<html><body>hello</body></html>")).toHaveProperty("error");
  });

  it("is refused when stripping leaves no drawing behind", () => {
    expect(sanitizeSvg("<script>alert(1)</script><svg onload=x></svg>".replace("<svg onload=x></svg>", ""))).toHaveProperty("error");
  });
});

describe("hasActiveContent", () => {
  it("is false for a plain drawing and true for anything executable", () => {
    expect(hasActiveContent(clean)).toBe(false);
    expect(hasActiveContent(`<svg><script/></svg>`)).toBe(true);
  });
});
