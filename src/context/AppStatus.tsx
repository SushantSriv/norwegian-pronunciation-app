import React, { useState } from 'react';
import { AppStatusContext } from './AppStatusContext';
import type { Status } from '../types/AppStatus';


export const AppStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const state = useState<Status>('welcome');
    return <AppStatusContext.Provider value={state}>{children}</AppStatusContext.Provider>;
};

