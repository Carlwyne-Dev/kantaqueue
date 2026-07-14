"use client";
import React, { Component, ReactNode } from "react";

export class WebGLErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export function WebGLFallback({ className }: { className?: string }) {
  return <div className={className} style={{ background: "linear-gradient(-45deg, #1E1E1E, #2f3b26, #1E1E1E, #182014)" }} />;
}
