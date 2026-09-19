import { Container, getContainer } from '@cloudflare/containers'

export class XFormContainer extends Container {
  defaultPort = 8080
  sleepAfter = '10m'

  constructor(ctx, env) {
    super(ctx, env)
    this.envVars = Object.fromEntries(
      Object.entries(env).filter(([key, value]) => key.startsWith('XFORM_') && typeof value === 'string'),
    )
  }
}

export default {
  async fetch(request, env) {
    // This job is for a trusted scheduler, never the public frontend.
    if (new URL(request.url).pathname.startsWith('/api/v1/internal/')) {
      return new Response('Not found', { status: 404 })
    }
    return getContainer(env.XFORM_CONTAINER, 'app').fetch(request)
  },
}
