const fields=['connectionMode','textProtocol','textBaseUrl','textModel','imageBaseUrl','imageModel','imageProtocol','imageMode','imageQuality','imageSize'];
export function applyProviderDefaults(state,runtime) {
  const profile=runtime?.providerDefaults;
  if(!profile?.revision||state.appliedProviderConfig===profile.revision)return false;
  for(const field of fields)if(typeof profile.settings?.[field]==='string')state.settings[field]=profile.settings[field];
  state.appliedProviderConfig=profile.revision;return true;
}
