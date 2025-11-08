import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

const PRODUCT_UPDATE_MUTATION = `#graphql
  mutation UpdateProduct($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id }
      userErrors { field message }
    }
  }
`;

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const productId = formData.get("productId")?.toString();
  const description = formData.get("description")?.toString();

  if (!productId || !description) {
    return json({ error: "Missing product or description" }, { status: 400 });
  }

  const descriptionHtml = description
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join("") || "<p></p>";

  const response = await admin.graphql(PRODUCT_UPDATE_MUTATION, {
    variables: {
      input: {
        id: productId,
        descriptionHtml,
      },
    },
  });

  const body = await response.json();
  const errors = body?.data?.productUpdate?.userErrors;
  if (errors?.length) {
    return json({ error: errors[0].message }, { status: 400 });
  }

  return json({ success: true });
};
