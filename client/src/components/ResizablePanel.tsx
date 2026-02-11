import React, { useState, useEffect, useCallback, useRef } from 'react';

interface ResizablePanelProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  initialLeftWidth?: number; // percentage
  minLeftWidth?: number; // pixels
  minRightWidth?: number; // pixels
  storageKey?: string;
}

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
  leftPanel,
  rightPanel,
  initialLeftWidth = 50,
  minLeftWidth = 300,
  minRightWidth = 300,
  storageKey = 'resizable-panel-width',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState(() => {
    // Try to load from localStorage
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed)) {
          return parsed;
        }
      }
    }
    return initialLeftWidth;
  });
  const [isDragging, setIsDragging] = useState(false);

  // Handle drag start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  // Handle drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const containerWidth = rect.width;
      const mouseX = e.clientX - rect.left;

      // Calculate percentage
      let newLeftWidth = (mouseX / containerWidth) * 100;

      // Apply constraints (convert pixel constraints to percentages)
      const minLeftPercent = (minLeftWidth / containerWidth) * 100;
      const minRightPercent = (minRightWidth / containerWidth) * 100;
      const maxLeftPercent = 100 - minRightPercent;

      newLeftWidth = Math.max(minLeftPercent, Math.min(maxLeftPercent, newLeftWidth));

      setLeftWidth(newLeftWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Add dragging cursor style to body
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, minLeftWidth, minRightWidth]);

  // Save to localStorage when drag ends
  useEffect(() => {
    if (!isDragging && storageKey) {
      localStorage.setItem(storageKey, leftWidth.toString());
    }
  }, [isDragging, leftWidth, storageKey]);

  return (
    <div ref={containerRef} className="resizable-panel flex-1 flex overflow-hidden">
      {/* Left panel */}
      <div
        className="flex flex-col overflow-hidden"
        style={{ width: `${leftWidth}%` }}
      >
        {leftPanel}
      </div>

      {/* Resizer */}
      <div
        className={`resizable-divider ${isDragging ? 'dragging' : ''}`}
        style={{ left: `${leftWidth}%`, transform: 'translateX(-50%)' }}
        onMouseDown={handleMouseDown}
        title="Drag to resize"
      />

      {/* Right panel */}
      <div
        className="flex flex-col overflow-hidden border-l border-midnight-700"
        style={{ width: `${100 - leftWidth}%` }}
      >
        {rightPanel}
      </div>
    </div>
  );
};
