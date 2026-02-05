import type { DemoInfoResponse } from "@shared/types";
import { useEffect, useState } from "react";
import * as api from "@client/api";

export function useDemoInfo() {
  const [demoInfo, setDemoInfo] = useState<DemoInfoResponse | null>(null);

  useEffect(() => {
    let isCancelled = false;

    void api
      .getDemoInfo()
      .then((info) => {
        if (!isCancelled) {
          setDemoInfo(info);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setDemoInfo(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  return demoInfo;
}
