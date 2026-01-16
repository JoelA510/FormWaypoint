import { useContext } from 'react';
import { MasterLibraryContext } from '../components/contexts/MasterLibraryContext';

export function useMasterLibrary() {
  return useContext(MasterLibraryContext);
}
