"use client";

import { useEffect, useRef } from "react";

export function GridCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      const gridSize = 60;
      const offsetX = (time * 0.015) % gridSize;
      const offsetY = (time * 0.01) % gridSize;

      ctx.strokeStyle = "rgba(32, 83, 117, 0.08)";
      ctx.lineWidth = 1;

      for (let x = -gridSize + offsetX; x < width + gridSize; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      for (let y = -gridSize + offsetY; y < height + gridSize; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const nodes = [
        { x: width * 0.2, y: height * 0.3, pulse: 0 },
        { x: width * 0.75, y: height * 0.25, pulse: 1.2 },
        { x: width * 0.6, y: height * 0.7, pulse: 2.4 },
        { x: width * 0.15, y: height * 0.75, pulse: 3.6 },
      ];

      nodes.forEach((node) => {
        const pulse = Math.sin(time * 0.002 + node.pulse) * 0.5 + 0.5;
        const radius = 3 + pulse * 4;

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(246, 107, 14, ${0.15 + pulse * 0.25})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 8, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(246, 107, 14, ${0.05 + pulse * 0.1})`;
        ctx.stroke();
      });

      animationId = requestAnimationFrame(draw);
    };

    resize();
    animationId = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 -z-10 opacity-60"
      aria-hidden="true"
    />
  );
}
