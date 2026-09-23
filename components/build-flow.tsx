"use client";

import { useState } from "react";

const stages = [
  { name: "Find", detail: "Good ideas meet the right people.", icon: "◎" },
  { name: "Build", detail: "Different skills. One shared direction.", icon: "⌘" },
  { name: "Ship", detail: "Turn your team's momentum into something real.", icon: "↗" },
];

export function BuildFlow() {
  const [active, setActive] = useState(0);

  return (
    <div className="build-flow">
      <div className="build-flow-orbit" aria-hidden="true" />
      <div className="build-flow-panel">
        <div className="build-flow-chrome" aria-hidden="true"><i /><i /><i /></div>
        <p className="build-flow-title">Your next big thing.</p>
        <div className="build-flow-track" role="group" aria-label="Explore the building journey">
          {stages.map((stage, index) => (
            <button
              key={stage.name}
              type="button"
              className="build-flow-step"
              aria-pressed={active === index}
              aria-controls="build-flow-description"
              onClick={() => setActive(index)}
            >
              <span className="build-flow-icon" aria-hidden="true">{stage.icon}</span>
              <span>{stage.name}</span>
              <span className="build-flow-number" aria-hidden="true">0{index + 1}</span>
            </button>
          ))}
        </div>
        <p id="build-flow-description" className="build-flow-description" aria-live="polite" aria-atomic="true">
          <span key={active}>{stages[active].detail}</span>
        </p>
        <div className="build-flow-progress" aria-hidden="true">
          <span style={{ width: `${((active + 1) / stages.length) * 100}%` }} />
        </div>
      </div>
      <span className="build-flow-badge"><span aria-hidden="true">ϟ</span> Built for collaboration</span>
    </div>
  );
}
