import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Card, Layout, Page, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

function buildLoginRedirect(url: URL) {
  const shopParam =
    url.searchParams.get("shop") ?? process.env.SHOP_DOMAIN ?? undefined;
  if (shopParam) {
    return redirect(`/auth/login?shop=${shopParam}`);
  }
  throw new Response("Missing shop parameter", { status: 400 });
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session?.shop;
    if (!shop) {
      const url = new URL(request.url);
      return buildLoginRedirect(url);
    }
    return json({ shop });
  } catch {
    const url = new URL(request.url);
    return buildLoginRedirect(url);
  }
}

export default function AppRoute() {
  const { shop } = useLoaderData<typeof loader>();
  return (
    <Page title="AIthor">
      <Layout>
        <Layout.Section>
          <Card>
            <Text as="h2" variant="headingMd">
              Welcome
            </Text>
            <div style={{ marginTop: 12 }}>
              <Text as="p">Connected shop: {shop}</Text>
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
