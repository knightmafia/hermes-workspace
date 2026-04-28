import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { OpsConsoleScreen } from '@/screens/agents/ops-console-screen'

export const Route = createFileRoute('/ops-console')({
  ssr: false,
  component: function OpsConsoleRoute() {
    usePageTitle('Ops Console')
    return <OpsConsoleScreen />
  },
})
