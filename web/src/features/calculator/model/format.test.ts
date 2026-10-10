import { describe, expect, it } from "vitest";
import { displaySize, formatDisplay } from "./format";

describe("formatDisplay", () => {
  it("groups thousands", () => {
    expect(formatDisplay("1234")).toBe("1,234");
    expect(formatDisplay("1234567.5")).toBe("1,234,567.5");
    expect(formatDisplay("-1234")).toBe("-1,234");
    expect(formatDisplay("123")).toBe("123");
  });

  it("keeps exactly what the user is typing", () => {
    expect(formatDisplay("1.")).toBe("1.");
    expect(formatDisplay("0.")).toBe("0.");
    expect(formatDisplay("1.50")).toBe("1.50");
    expect(formatDisplay("-0")).toBe("-0");
    expect(formatDisplay("0.1234567890123456")).toBe("0.1234567890123456");
    expect(formatDisplay("1234567890123456")).toBe("1,234,567,890,123,456");
  });

  it("leaves Error untouched", () => {
    expect(formatDisplay("Error")).toBe("Error");
  });

  it("rounds a long fractional result to 16 significant digits", () => {
    expect(formatDisplay("123.4567890123456789")).toBe("123.4567890123457");
    expect(formatDisplay("9.99999999999999999")).toBe("10");
    expect(formatDisplay("-2.00000000000000001")).toBe("-2");
  });

  it("switches to scientific notation when the integer part is too long", () => {
    expect(formatDisplay("1" + "0".repeat(30))).toBe("1e+30");
    expect(formatDisplay("12345678901234567890")).toBe("1.23456789e+19");
    expect(formatDisplay("-12345678915555555555")).toBe("-1.234567892e+19");
    expect(formatDisplay("99999999999999999999")).toBe("1e+20");
    expect(formatDisplay("1" + "0".repeat(1000))).toBe("1e+1000");
  });

  it("renders API results in exponent notation with a short mantissa", () => {
    expect(formatDisplay("1E-17")).toBe("1e-17");
    expect(formatDisplay("-1.5E-20")).toBe("-1.5e-20");
    expect(formatDisplay("8.673617379884035E-19")).toBe("8.67361738e-19");
    expect(formatDisplay("9.9999999999E-30")).toBe("1e-29");
  });
});

describe("compact formatting", () => {
  it("keeps fewer significant digits when asked", () => {
    expect(formatDisplay("1.414213562373095", 12)).toBe("1.41421356237");
    expect(formatDisplay("0.3333333333333333", 12)).toBe("0.333333333333");
    expect(formatDisplay("287.4885", 12)).toBe("287.4885");
    expect(formatDisplay("18446744073709551616", 12)).toBe("1.844674407e+19");
  });
});

describe("rounding", () => {
  it("rounds half to even, like the API", () => {
    expect(formatDisplay("0.12345678901234565")).toBe("0.1234567890123456");
    expect(formatDisplay("0.12345678901234535")).toBe("0.1234567890123454");
    expect(formatDisplay("0.123456789012345651")).toBe("0.1234567890123457");
    expect(formatDisplay("12345678905000000000")).toBe("1.23456789e+19");
    expect(formatDisplay("12345678915000000000")).toBe("1.234567892e+19");
  });
});

describe("displaySize", () => {
  it("shrinks as the text grows", () => {
    expect(displaySize("123")).toBe("lg");
    expect(displaySize("123,456,789")).toBe("md");
    expect(displaySize("1,234,567,890,123")).toBe("sm");
    expect(displaySize("-1,234,567,890,123,456")).toBe("xs");
  });
});
