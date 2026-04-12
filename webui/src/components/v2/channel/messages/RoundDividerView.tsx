import type { RoundDividerMessage } from '../../../../stores/v2/messageStore';

interface RoundDividerViewProps {
  message: RoundDividerMessage;
}

export function RoundDividerView({ message }: RoundDividerViewProps) {
  return (
    <div className="v2-step-group py-3">
      {/* Ring node */}
      <div
        className="absolute z-2"
        style={{
          left: '32px',
          top: '50%',
          width: '9px',
          height: '9px',
          borderRadius: '50%',
          border: '1.5px solid var(--v2-accent, #5865f2)',
          opacity: 0.6,
          transform: 'translate(-50%, -50%)',
        }}
      />
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-v2-border" />
        <div className="flex items-center gap-2 shrink-0">
          {/* Round number badge */}
          <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded bg-v2-accent/10 border border-v2-accent/20 text-[10px] font-bold text-v2-accent tabular-nums">
            {message.roundNumber}
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-v2-text-muted">
            {message.label}
          </span>
        </div>
        <div className="flex-1 h-px bg-v2-border" />
      </div>
    </div>
  );
}
