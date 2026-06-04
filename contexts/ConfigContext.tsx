import React, { createContext, useContext, useState } from "react";
import { Config } from "../api/types";

type ConfigContestState = [Config | null, (config: Config | null) => void];
const ConfigContext = createContext<ConfigContestState | null>(null);

export function ConfigContextProvider({ children }: { children: React.ReactNode }) {
    const configState = useState<Config | null>(null);
    return (
        <ConfigContext.Provider value={configState}>{children}</ConfigContext.Provider>
    )
}

export function useConfigState() {
    const configState = useContext(ConfigContext);

    if (!configState) {
        throw new Error('ConfigContext is not used');
    }
    return configState;
}