"use strict";

const { multiplyMoney, parseLocalizedNumber, percentageMoney, roundMoney, sumMoney } = require("../src/numbers");

describe("financial number parsing", () => {
  it("preserves numeric decimals instead of treating their dot as grouping", () => {
    expect(parseLocalizedNumber(14549 / 1.21)).toBeCloseTo(12023.96694214876, 8);
    expect(parseLocalizedNumber("12023.96694214876")).toBeCloseTo(12023.96694214876, 8);
  });

  it("accepts Dutch and international money notation", () => {
    expect(parseLocalizedNumber("€ 12.023,97")).toBe(12023.97);
    expect(parseLocalizedNumber("12,50")).toBe(12.5);
    expect(parseLocalizedNumber("12,023.97")).toBe(12023.97);
  });

  it("rounds financial results to cents", () => {
    expect(roundMoney(14549 / 1.21)).toBe(12023.97);
    expect(roundMoney(12023.97 * 0.21)).toBe(2525.03);
    expect(roundMoney("1.005")).toBe(1.01);
    expect(roundMoney("-1.005")).toBe(-1.01);
    expect(roundMoney("9999999.995")).toBe(10000000);
    expect(multiplyMoney("3", "0.335")).toBe(1.01);
    expect(percentageMoney("0.05", "10")).toBe(0.01);
    expect(sumMoney(["0.1", "0.2"])).toBe(0.3);
  });
});
