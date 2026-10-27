"""Constants for the NXS / NEXXEN testnet simulation.

Every value in this module carries explicit provenance. Nothing is invented.

Provenance levels:

SOURCED
    Taken from a primary source that was fetched and read while writing this
    file. Has a source URL and a year.
UNVERIFIED
    A figure that circulates widely and has a URL and year, but whose primary
    source could not be read directly (paywalled, 403, or only restated by
    secondary outlets). Treat as indicative only. Do not publish as fact.
EXAMPLE_INPUT
    A modelling choice, not a measurement. Invented for the simulation so it
    can run. Must be replaced with sourced or governance-approved values
    before any result is used outside a sandbox.

Scope reminders encoded here rather than in prose:
  - Testnet only. No mainnet constants, no keys, no endpoints that move funds.
  - Environmental benefits produced by this model are PROPOSED figures,
    pending independent MRV verification. See BENEFIT_CLAIM_STATUS.
  - Token voting never approves benefits. See BENEFIT_APPROVAL_RULE.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Provenance(str, Enum):
    SOURCED = "SOURCED"
    UNVERIFIED = "UNVERIFIED"
    EXAMPLE_INPUT = "EXAMPLE_INPUT"


@dataclass(frozen=True)
class Constant:
    """A single number plus where it came from."""

    value: float
    unit: str
    provenance: Provenance
    note: str
    source_url: str | None = None
    source_year: int | None = None

    def __float__(self) -> float:
        return float(self.value)


REGISTRY: dict[str, Constant] = {}


def define(name: str, c: Constant) -> float:
    """Register a constant for the assumptions table and return its value."""
    if name in REGISTRY:
        raise ValueError(f"constant {name} defined twice")
    REGISTRY[name] = c
    return float(c.value)


# ---------------------------------------------------------------------------
# Claim-status guards. These are strings, not numbers, and are asserted in
# tests so the language cannot drift.
# ---------------------------------------------------------------------------

BENEFIT_CLAIM_STATUS = "proposed, pending independent MRV verification"
BENEFIT_APPROVAL_RULE = (
    "Token voting never approves benefits. Votes may signal preference only. "
    "Benefit recognition requires independent MRV verification outside this model."
)
NETWORK_SCOPE = "testnet-only simulation; no mainnet activity is modelled or implied"


# ---------------------------------------------------------------------------
# XRP Ledger activity
# ---------------------------------------------------------------------------

XRPL_ENERGY_KWH_PER_TX = define(
    "XRPL_ENERGY_KWH_PER_TX",
    Constant(
        value=0.0079,
        unit="kWh/transaction",
        provenance=Provenance.UNVERIFIED,
        note=(
            "Widely restated figure for XRPL energy per transaction. Ripple's own "
            "sustainability pages assert carbon neutrality since October 2020 but "
            "publish no per-transaction kWh number, and learn.xrpl.org returned "
            "HTTP 403 when fetched. Primary study not read. Indicative only."
        ),
        source_url="https://www.bitget.com/news/detail/12560604949089",
        source_year=2026,
    ),
)

XRPL_BASE_FEE_DROPS = define(
    "XRPL_BASE_FEE_DROPS",
    Constant(
        value=10.0,
        unit="drops/transaction",
        provenance=Provenance.UNVERIFIED,
        note=(
            "Standard XRPL reference transaction cost is 10 drops (0.00001 XRP). "
            "Long-standing protocol default; xrpl.org docs not re-fetched for this run."
        ),
        source_url="https://xrpl.org/transaction-cost.html",
        source_year=2026,
    ),
)

DROPS_PER_XRP = define(
    "DROPS_PER_XRP",
    Constant(
        value=1_000_000.0,
        unit="drops/XRP",
        provenance=Provenance.SOURCED,
        note="Protocol definition: 1 XRP is 1,000,000 drops.",
        source_url="https://xrpl.org/basic-data-types.html",
        source_year=2026,
    ),
)

EVM_SIDECHAIN_CHAIN_ID = define(
    "EVM_SIDECHAIN_CHAIN_ID",
    Constant(
        value=1449000.0,
        unit="chain id",
        provenance=Provenance.SOURCED,
        note=(
            "XRPL EVM Testnet chain id used by this repository's AP4M integration. "
            "Asserted in nexxen-ui/src/lib/ap4m/agent.ts."
        ),
        source_url="https://github.com/nexuswater/nexxen",
        source_year=2026,
    ),
)

EVM_GAS_PER_CARD_TX = define(
    "EVM_GAS_PER_CARD_TX",
    Constant(
        value=120_000.0,
        unit="gas units/transaction",
        provenance=Provenance.EXAMPLE_INPUT,
        note=(
            "Assumed gas for one voucher redemption on the PaymentLedger contract. "
            "Order of magnitude for an ERC20 transfer plus event emission. Replace "
            "with measured gas from testnet receipts."
        ),
    ),
)

EVM_GAS_PRICE_GWEI = define(
    "EVM_GAS_PRICE_GWEI",
    Constant(
        value=10.0,
        unit="gwei",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Assumed baseline sidechain gas price. Replace with observed testnet fee data.",
    ),
)


# ---------------------------------------------------------------------------
# Quicknode plan tiers and API credit accounting
# ---------------------------------------------------------------------------

QUICKNODE_CREDITS_PER_EVM_CALL = define(
    "QUICKNODE_CREDITS_PER_EVM_CALL",
    Constant(
        value=20.0,
        unit="API credits/call",
        provenance=Provenance.SOURCED,
        note=(
            "Quicknode charges a flat 20 API credits for standard JSON-RPC methods on "
            "Ethereum and EVM-compatible chains. Per-method granularity is not published."
        ),
        source_url="https://www.quicknode.com/api-credits/eth",
        source_year=2026,
    ),
)

QUICKNODE_ADVANCED_API_MULTIPLIER = define(
    "QUICKNODE_ADVANCED_API_MULTIPLIER",
    Constant(
        value=2.0,
        unit="multiplier",
        provenance=Provenance.SOURCED,
        note="Advanced APIs (Trace, Debug, Token, NFT) apply a 2x credit multiplier.",
        source_url="https://www.quicknode.com/api-credits/eth",
        source_year=2026,
    ),
)

QUICKNODE_SPECIALIZED_MULTIPLIER = define(
    "QUICKNODE_SPECIALIZED_MULTIPLIER",
    Constant(
        value=4.0,
        unit="multiplier",
        provenance=Provenance.SOURCED,
        note=(
            "Specialized calls such as txpool_content and "
            "trace_replayBlockTransactions apply a 4x credit multiplier."
        ),
        source_url="https://www.quicknode.com/api-credits/eth",
        source_year=2026,
    ),
)

# (monthly_usd, included_credits_per_month, requests_per_second, overage_usd_per_1m_credits)
# SOURCED: https://www.quicknode.com/pricing (2026).
QUICKNODE_PLANS: tuple[tuple[str, float, float, float, float], ...] = (
    ("Free",             0.0,    10_000_000.0,    15.0,  0.00),
    ("Build",           49.0,    80_000_000.0,    50.0,  0.62),
    ("Accelerate",     249.0,   450_000_000.0,   125.0,  0.56),
    ("Scale",          499.0,   950_000_000.0,   250.0,  0.53),
    ("Business",       999.0, 2_000_000_000.0,   500.0,  0.50),
    ("Business+ T1",  1499.0, 3_200_000_000.0,   500.0,  0.50),
    ("Business+ T2",  1999.0, 4_500_000_000.0,   500.0,  0.50),
    ("Business+ T3",  2999.0, 7_000_000_000.0,   500.0,  0.50),
)

REGISTRY["QUICKNODE_PLANS"] = Constant(
    value=float(len(QUICKNODE_PLANS)),
    unit="plan tiers",
    provenance=Provenance.SOURCED,
    note=(
        "Eight published tiers from Free to Business+ Tier 3, with included credits "
        "and per-1M overage rates. Enterprise is custom priced and excluded. "
        "Annual billing is stated as 15 percent below monthly."
    ),
    source_url="https://www.quicknode.com/pricing",
    source_year=2026,
)

QUICKNODE_ANNUAL_DISCOUNT = define(
    "QUICKNODE_ANNUAL_DISCOUNT",
    Constant(
        value=0.15,
        unit="fraction",
        provenance=Provenance.SOURCED,
        note="Annual billing is 15 percent below monthly pricing.",
        source_url="https://www.quicknode.com/pricing",
        source_year=2026,
    ),
)

QUICKNODE_WATT_HOURS_PER_CREDIT = define(
    "QUICKNODE_WATT_HOURS_PER_CREDIT",
    Constant(
        value=0.0005,
        unit="Wh/API credit",
        provenance=Provenance.EXAMPLE_INPUT,
        note=(
            "Energy attributed to one API credit of RPC compute. Quicknode publishes "
            "no energy disclosure per credit, so this is a modelling placeholder and "
            "is the single largest uncertainty in the compute footprint. Sensitivity "
            "is reported in the summary."
        ),
    ),
)


# ---------------------------------------------------------------------------
# Energy, carbon and water conversion factors
# ---------------------------------------------------------------------------

GRID_CO2E_KG_PER_KWH = define(
    "GRID_CO2E_KG_PER_KWH",
    Constant(
        value=0.394,
        unit="kg CO2e/kWh",
        provenance=Provenance.SOURCED,
        note=(
            "EPA Greenhouse Gas Equivalencies Calculator, national average baseload "
            "rate of 3.94e-4 metric tons CO2 per kWh after transmission and "
            "distribution losses, citing eGRID year 2022 data. A preliminary "
            "eGRID2024 figure of 0.341 kg/kWh circulates but EPA has not published it."
        ),
        source_url="https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references",
        source_year=2024,
    ),
)

DATACENTER_PUE = define(
    "DATACENTER_PUE",
    Constant(
        value=1.56,
        unit="ratio",
        provenance=Provenance.EXAMPLE_INPUT,
        note=(
            "Power usage effectiveness multiplier applied to RPC compute energy. "
            "Commonly quoted industry averages cluster near 1.5 to 1.6 but no "
            "primary source was read for this run. Replace with the operator's "
            "measured PUE."
        ),
    ),
)

DATACENTER_WATER_ONSITE_L_PER_KWH = define(
    "DATACENTER_WATER_ONSITE_L_PER_KWH",
    Constant(
        value=0.36,
        unit="L/kWh",
        provenance=Provenance.UNVERIFIED,
        note=(
            "On-site data centre water consumption per kWh, attributed to the LBNL "
            "United States data centre energy usage reporting through 2023. Restated "
            "by secondary outlets; the LBNL PDF itself was not parsed for this run."
        ),
        source_url="https://eta-publications.lbl.gov/sites/default/files/lbnl-1005775_v2.pdf",
        source_year=2024,
    ),
)

DATACENTER_WATER_INDIRECT_L_PER_KWH = define(
    "DATACENTER_WATER_INDIRECT_L_PER_KWH",
    Constant(
        value=4.52,
        unit="L/kWh",
        provenance=Provenance.UNVERIFIED,
        note=(
            "Indirect (power generation) water consumption per kWh of data centre "
            "electricity, same LBNL-attributed reporting. Dominates on-site water by "
            "roughly 12.6x. Not parsed from the primary PDF."
        ),
        source_url="https://eta-publications.lbl.gov/sites/default/files/lbnl-1005775_v2.pdf",
        source_year=2024,
    ),
)


# ---------------------------------------------------------------------------
# Offset instruments. Prices are volatile and deliberately not sourced.
# ---------------------------------------------------------------------------

CARBON_CREDIT_USD_PER_TONNE = define(
    "CARBON_CREDIT_USD_PER_TONNE",
    Constant(
        value=20.0,
        unit="USD/tonne CO2e",
        provenance=Provenance.EXAMPLE_INPUT,
        note=(
            "Placeholder price for a verified carbon credit. Voluntary market prices "
            "vary by orders of magnitude across vintages and methodologies. No price "
            "is asserted here and none should be quoted from this model."
        ),
    ),
)

WATER_CREDIT_USD_PER_KL = define(
    "WATER_CREDIT_USD_PER_KL",
    Constant(
        value=0.45,
        unit="USD/kilolitre",
        provenance=Provenance.EXAMPLE_INPUT,
        note=(
            "Placeholder price for one verified water credit (WTR) representing one "
            "kilolitre of volumetric water benefit. Replace with contracted pricing "
            "after MRV verification."
        ),
    ),
)

WATER_POSITIVE_MULTIPLIER = define(
    "WATER_POSITIVE_MULTIPLIER",
    Constant(
        value=1.2,
        unit="ratio",
        provenance=Provenance.EXAMPLE_INPUT,
        note=(
            "Replenishment above gross water consumption required to call activity "
            "water positive. 1.2 means restore 120 percent of litres consumed. This "
            "is a policy choice, not a measurement."
        ),
    ),
)

CARBON_NEGATIVE_MULTIPLIER = define(
    "CARBON_NEGATIVE_MULTIPLIER",
    Constant(
        value=1.1,
        unit="ratio",
        provenance=Provenance.EXAMPLE_INPUT,
        note=(
            "Retirement above gross emissions required to call activity carbon "
            "negative. 1.1 means retire 110 percent of emitted CO2e. Policy choice."
        ),
    ),
)

OFFSET_SCENARIOS: dict[str, float] = {"none": 0.0, "partial": 0.5, "full": 1.0}

REGISTRY["OFFSET_SCENARIOS"] = Constant(
    value=float(len(OFFSET_SCENARIOS)),
    unit="scenarios",
    provenance=Provenance.EXAMPLE_INPUT,
    note=(
        "Three required scenarios: no offsets, partial at 50 percent of the required "
        "volume, and full at 100 percent of the required volume."
    ),
)


def assumptions_table() -> list[dict[str, object]]:
    """Rows for the assumptions table in summary.md and results/assumptions.csv."""
    rows: list[dict[str, object]] = []
    for name, c in sorted(REGISTRY.items()):
        rows.append(
            {
                "constant": name,
                "value": c.value,
                "unit": c.unit,
                "provenance": c.provenance.value,
                "source_url": c.source_url or "",
                "source_year": c.source_year or "",
                "note": c.note,
            }
        )
    return rows


def counts_by_provenance() -> dict[str, int]:
    out = {p.value: 0 for p in Provenance}
    for c in REGISTRY.values():
        out[c.provenance.value] += 1
    return out
