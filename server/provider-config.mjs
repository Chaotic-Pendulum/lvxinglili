export function providerKey(type, endpoint, suppliedKey, env=process.env) {
  const host=new URL(endpoint).hostname;
  if(host==='openrouter.ai'&&env.OPENROUTER_API_KEY)return env.OPENROUTER_API_KEY;
  return (type==='text'?env.ROAM_TEXT_KEY:env.ROAM_IMAGE_KEY)||suppliedKey;
}
export function providerRuntime(env=process.env) {
  const configured=Boolean(env.OPENROUTER_API_KEY);
  return {
    textConfigured:Boolean(env.ROAM_TEXT_KEY),imageConfigured:Boolean(env.ROAM_IMAGE_KEY),openrouterConfigured:configured,
    providerDefaults:configured&&env.ROAM_PROVIDER_CONFIG_VERSION?{
      revision:env.ROAM_PROVIDER_CONFIG_VERSION,
      settings:{connectionMode:'proxy',textProtocol:'chat',textBaseUrl:env.ROAM_TEXT_BASE_URL||'https://openrouter.ai/api/v1',textModel:env.ROAM_TEXT_MODEL||'openai/gpt-5.6-luna',imageBaseUrl:env.ROAM_IMAGE_BASE_URL||'https://openrouter.ai/api/v1',imageModel:env.ROAM_IMAGE_MODEL||'openai/gpt-image-2.5-sunburst',imageProtocol:'openrouter',imageMode:'edit',imageQuality:'medium',imageSize:'1536x1024'}
    }:null
  };
}
