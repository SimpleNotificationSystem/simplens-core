"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { EditorProps } from "@monaco-editor/react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[350px] items-center justify-center rounded-md border bg-muted/30">
      <span className="text-sm text-muted-foreground">Loading editor…</span>
    </div>
  ),
});

/**
 * A wrapper around Monaco Editor that guards against React Strict Mode's
 * double-mount/dispose cycle which causes "domNode is undefined" and
 * "InstantiationService has been disposed" errors.
 *
 * It delays the initial mount by one tick so the editor is never created
 * during the first (immediately-unmounted) render cycle in dev strict mode.
 */
export function StableMonacoEditor(props: EditorProps) {
  const [ready, setReady] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    // Delay mount by one frame so strict-mode's first dispose cycle completes
    const raf = requestAnimationFrame(() => {
      if (mountedRef.current) setReady(true);
    });
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  if (!ready) {
    return (
      <div
        className="flex items-center justify-center rounded-md border bg-muted/30"
        style={{ height: props.height ?? "350px" }}
      >
        <span className="text-sm text-muted-foreground">Loading editor…</span>
      </div>
    );
  }

  return <MonacoEditor {...props} />;
}
