import { NzbdavFamilyAdapter } from './nzbdav-family.mjs';

export default class InfinidyskAdapter extends NzbdavFamilyAdapter {
  static id = 'infinidysk';
  static displayName = 'InfiniDysk';
  static repo = 'https://github.com/infinidysk/infinidysk';
  // The fork keeps the solution at the root and names the backend project explicitly.
  static backendProject = 'backend';
}
