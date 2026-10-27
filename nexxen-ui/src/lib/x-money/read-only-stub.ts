/**
 * Read-only X Money stub. Interface plus an in-memory mock.
 * No keys, no network, no balance lookup, no transfer, no card creation.
 * Do not import this from spend, wallet, lending, or payment code.
 */

export type XMoneyReadOnlySnapshot = {
  connected: false;
  source: "mock";
  note: string;
};

export interface XMoneyReadOnlyAdapter {
  readSnapshot(): Promise<XMoneyReadOnlySnapshot>;
}

export const xMoneyReadOnlyMock: XMoneyReadOnlyAdapter = {
  async readSnapshot() {
    return {
      connected: false,
      source: "mock",
      note: "Read-only mock. Not connected to X Money. Does not move money.",
    };
  },
};
