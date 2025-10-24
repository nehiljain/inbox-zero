import { DigestMigrationAdmin } from "./DigestMigrationAdmin";

interface PageProps {
  params: Promise<{ emailAccountId: string }>;
}

export default async function DigestMigrationPage(props: PageProps) {
  const { emailAccountId } = await props.params;

  return (
    <div className="container mx-auto py-8">
      <DigestMigrationAdmin emailAccountId={emailAccountId} />
    </div>
  );
}
