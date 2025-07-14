import { useContext } from 'react';
import { AppStatusContext } from './AppStatusContext';


export const useAppStatus = () => useContext(AppStatusContext);
