// SPDX-License-Identifier: BUSL-1.1
"use client";

import { Cpu, HardDrive, Gauge, MemoryStick } from "lucide-react";
import type { HardwareProfile } from "./types";
import { mbToGB } from "./types";

interface HardwareOverviewProps {
  hardware: HardwareProfile;
}

const CARDS = [
  {
    key: "gpu" as const,
    label: "GPU",
    icon: Cpu,
    value: (hw: HardwareProfile) => hw.gpu.available ? hw.gpu.name : "None detected",
    sub: (hw: HardwareProfile) => hw.gpu.available ? `${mbToGB(hw.gpu.vramMB)} GB VRAM` : "CPU-only inference",
  },
  {
    key: "ram" as const,
    label: "RAM",
    icon: MemoryStick,
    value: (hw: HardwareProfile) => `${mbToGB(hw.ram.totalMB, 0)} GB`,
    sub: (hw: HardwareProfile) => `${mbToGB(hw.ram.availableMB, 0)} GB available`,
  },
  {
    key: "disk" as const,
    label: "Disk",
    icon: HardDrive,
    value: (hw: HardwareProfile) => `${hw.disk.freeGB} GB free`,
    sub: (hw: HardwareProfile) => hw.disk.type !== "unknown" ? hw.disk.type.toUpperCase() : "Storage",
  },
  {
    key: "cpu" as const,
    label: "CPU",
    icon: Gauge,
    value: (hw: HardwareProfile) => `${hw.cpu.cores} cores`,
    sub: (hw: HardwareProfile) => hw.cpu.model.split(" ").slice(0, 3).join(" "),
  },
];

export function HardwareOverview({ hardware }: HardwareOverviewProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {CARDS.map(({ key, label, icon: Icon, value, sub }) => (
        <div
          key={key}
          className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3"
        >
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Icon className="h-3 w-3" />
            {label}
          </div>
          <span className="text-sm font-medium text-foreground">
            {value(hardware)}
          </span>
          <span className="truncate text-xs text-muted-foreground" title={sub(hardware)}>
            {sub(hardware)}
          </span>
        </div>
      ))}
    </div>
  );
}
