import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Card, Layout, Page, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session?.shop;
    if (!shop) {
      const url = new URL(request.url);
      const shopParam = url.searchParams.get("shop");
      if (shopParam) return redirect(`/auth/login?shop=${shopParam}`);
      throw new Response("Missing session", { status: 401 });
    }
    return json({ shop });
  } catch {
    const url = new URL(request.url);
    const shopParam = url.searchParams.get("shop");
    if (shopParam) return redirect(`/auth/login?shop=${shopParam}`);
    throw new Response("Unauthorized", { status: 401 });
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
