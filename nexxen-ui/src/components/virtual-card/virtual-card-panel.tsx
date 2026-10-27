"use client";

import { useState } from "react";
import {
  MARQETA_SANDBOX_VIRTUAL_CARD,
  formatExpiration,
  groupPan,
  maskPan,
} from "@/fixtures/marqeta-sandbox-virtual-card";
import {
  ContactlessIcon,
  EmvChip,
  MastercardPlaceholder,
  NexusWaterMark,
  PixelPunkAvatar,
} from "@/components/virtual-card/virtual-card-marks";
import "./virtual-card.css";

type Face = "front" | "back";

const card = MARQETA_SANDBOX_VIRTUAL_CARD;

function flipLabel(face: Face, showDetails: boolean, frozen: boolean) {
  const side = face === "front" ? "front" : "back";
  const next = face === "front" ? "back" : "front";
  const digits = showDetails
    ? "Sandbox sample digits are visible."
    : `Only the last four digits ${card.lastFour} are visible.`;
  const ice = frozen ? " Shown frozen, visual only." : "";
  return `Sandbox virtual card, ${side}. Cardholder ${card.cardholderName}. ${digits}${ice} Activate to flip to the ${next}.`;
}

export function VirtualCardPanel() {
  const [face, setFace] = useState<Face>("front");
  const [showDetails, setShowDetails] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [status, setStatus] = useState("Card ready. Details hidden. Not frozen.");

  const panText = showDetails ? groupPan(card.pan) : maskPan(card.lastFour);
  const cvvText = showDetails ? card.cvv : "•••";
  const expiry = formatExpiration(card.expiration);

  const flip = () => {
    const next = face === "front" ? "back" : "front";
    setFace(next);
    setStatus(next === "back" ? "Showing the back of the sandbox card." : "Showing the front of the sandbox card.");
  };

  const toggleDetails = () => {
    const next = !showDetails;
    setShowDetails(next);
    setStatus(
      next
        ? `Sandbox data only. Sample PAN ${groupPan(card.pan)}. Sample CVV ${card.cvv}. Sample expiration ${expiry}. Not a live card.`
        : "Sandbox details hidden. The card shows the last four digits only.",
    );
  };

  const toggleFrozen = () => {
    const next = !frozen;
    setFrozen(next);
    setStatus(
      next
        ? "Card picture frozen. Visual only. Spend, limits, lending, and payments are unchanged."
        : "Frozen picture cleared. Still visual only.",
    );
  };

  return (
    <section className="nvc" aria-labelledby="nvc-heading">
      <div className="nvc-inner-wrap">
        <div className="nvc-head">
          <h2 id="nvc-heading" className="nvc-heading">
            Sandbox virtual card
          </h2>
          <div className="nvc-pills">
            <span className="nvc-pill">{card.networkName}</span>
            <span className="nvc-pill nvc-pill-test">{card.environmentName}</span>
          </div>
        </div>

        <div className="nvc-layout">
          <div className="nvc-stage">
            <button
              type="button"
              className="nvc-card"
              data-face={face}
              data-frozen={frozen ? "true" : "false"}
              data-details={showDetails ? "true" : "false"}
              aria-pressed={face === "back"}
              aria-label={flipLabel(face, showDetails, frozen)}
              onClick={flip}
            >
              <span className="nvc-card-inner">
                <span className="nvc-face nvc-front">
                  <span className="nvc-face-body">
                    <span className="nvc-front-top">
                      <span className="nvc-brand">
                        <NexusWaterMark />
                        <span className="nvc-wordmark">NEXXEN</span>
                      </span>
                      <span className="nvc-front-marks">
                        <ContactlessIcon />
                        <span className="nvc-badge">Testnet</span>
                      </span>
                    </span>
                    <span className="nvc-chip-row">
                      <EmvChip />
                    </span>
                    <span className="nvc-pan" data-shown={showDetails ? "true" : "false"}>
                      {panText}
                    </span>
                    {showDetails ? <span className="nvc-reveal-flag">{card.sourceLabel}</span> : null}
                    <span className="nvc-front-bottom">
                      <span className="nvc-holder">
                        <PixelPunkAvatar />
                        <span className="nvc-holder-copy">
                          <span className="nvc-holder-kicker">Cardholder</span>
                          <span className="nvc-holder-name">{card.cardholderName}</span>
                        </span>
                      </span>
                      <MastercardPlaceholder />
                    </span>
                  </span>
                  {frozen ? <FrostVeil /> : null}
                </span>

                <span className="nvc-face nvc-back">
                  <span className="nvc-mag" />
                  <span className="nvc-face-body nvc-back-body">
                    <span className="nvc-back-kicker">{card.sourceLabel}</span>
                    <span className="nvc-sig">
                      <span className="nvc-sig-name">{card.cardholderName}</span>
                      <span className="nvc-cvv-box">
                        <span className="nvc-cvv-label">CVV</span>
                        <span className="nvc-cvv-value">{cvvText}</span>
                      </span>
                    </span>
                    <span className="nvc-exp">
                      <span className="nvc-cvv-label">Exp</span>
                      <span>{expiry}</span>
                      <span className="nvc-sample-tag">sample</span>
                    </span>
                    <span className="nvc-back-bottom">
                      <span className="nvc-brand">
                        <NexusWaterMark />
                        <span className="nvc-wordmark">NEXXEN</span>
                      </span>
                      <span className="nvc-badge">Testnet</span>
                    </span>
                    <span className="nvc-back-note">Sample preview. Not a payment instrument.</span>
                  </span>
                  {frozen ? <FrostVeil /> : null}
                </span>
              </span>
            </button>
            <p className="nvc-hint">Tap card to flip</p>
          </div>

          <div className="nvc-copy">
            <p className="nvc-lead">
              Sandbox preview for the NEXXEN agent. Flip the card, reveal sample details, or freeze the picture.
              Nothing here moves money.
            </p>
            <div className="nvc-actions">
              <button
                type="button"
                className="nvc-btn"
                aria-pressed={showDetails}
                aria-controls="nvc-sandbox-details"
                onClick={toggleDetails}
              >
                {showDetails ? "Hide details" : "Show details"}
              </button>
              <button
                type="button"
                className="nvc-btn"
                aria-pressed={frozen}
                aria-describedby="nvc-freeze-note"
                onClick={toggleFrozen}
              >
                {frozen ? "Unfreeze" : "Freeze"}
              </button>
            </div>
            <div id="nvc-sandbox-details" className="nvc-details">
              {showDetails ? (
                <>
                  <p className="nvc-kicker">{card.sourceLabel}</p>
                  <dl className="nvc-dl">
                    <div>
                      <dt>PAN</dt>
                      <dd>{groupPan(card.pan)}</dd>
                    </div>
                    <div>
                      <dt>CVV</dt>
                      <dd>{card.cvv}</dd>
                    </div>
                    <div>
                      <dt>Exp</dt>
                      <dd>{expiry} sample</dd>
                    </div>
                  </dl>
                  <p className="nvc-fine">Public Marqeta sample. Not a live card.</p>
                </>
              ) : (
                <p className="nvc-fine">Details hidden. The card shows the last four digits only.</p>
              )}
            </div>
            <p id="nvc-freeze-note" className="nvc-fine">
              Freeze is a local visual state only. It does not call a backend or change spend, limits, lending, or
              payments.
            </p>
          </div>
        </div>
      </div>
      <p className="nvc-sr" aria-live="polite">
        {status}
      </p>
    </section>
  );
}

function FrostVeil() {
  return (
    <span className="nvc-frost">
      <strong>FROZEN</strong>
      <span>Visual only</span>
    </span>
  );
}
