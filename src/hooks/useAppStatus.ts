import { useContext } from 'react';
import { AppStatusContext } from '../context/AppStatusContext';
import type { Status } from '../types/AppStatus';

export const useAppStatus = () => useContext(AppStatusContext) as [Status, React.Dispatch<Status>];
