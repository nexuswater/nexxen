// Testnet-only transaction guard. Never signs or broadcasts above the explicit gas budget.
export const GAS_BUDGET_WEI = 10_000_000_000_000_000n;
export function boundedSubmitter(wallet, provider) {
  return new Proxy(wallet, {get(target, property) {
    if (property !== 'sendTransaction') {
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
    return async transaction => {
      if ((await provider.getNetwork()).chainId !== 1449000n) throw Error('TESTNET_CHAIN_REQUIRED');
      if (String(transaction.to).toLowerCase() !== '0xcab42800a5ecf0d253fa2581bb3334b4daefae91' || BigInt(transaction.value ?? 0) !== 0n) throw Error('REDEMPTION_DESTINATION_REQUIRED');
      // Reject caller fee overrides; only this guard computes and binds the budget.
      if (['gasLimit','gasPrice','maxFeePerGas','maxPriorityFeePerGas','type','chainId'].some(k => transaction[k] !== undefined)) throw Error('UNEXPECTED_TRANSACTION_OVERRIDE');
      const estimate = await provider.estimateGas({...transaction, from:target.address});
      const gasLimit = (estimate * 120n + 99n) / 100n;
      const fees = await provider.getFeeData();
      const maxFeePerGas = fees.maxFeePerGas;
      const maxPriorityFeePerGas = fees.maxPriorityFeePerGas;
      if (gasLimit <= 0n || !maxFeePerGas || maxFeePerGas <= 0n || maxPriorityFeePerGas == null || maxPriorityFeePerGas < 0n || maxPriorityFeePerGas > maxFeePerGas) throw Error('FEE_DATA_UNAVAILABLE');
      if (gasLimit * maxFeePerGas > GAS_BUDGET_WEI) throw Error('GAS_BUDGET_EXCEEDED');
      return target.sendTransaction({...transaction, chainId:1449000, type:2, gasLimit, maxFeePerGas, maxPriorityFeePerGas});
    };
  }});
}
