import { createContext } from 'react';
import type { Status } from '../types/AppStatus';

export const AppStatusContext = createContext<[Status, React.Dispatch<Status>]>(['welcome', () => { }]);
