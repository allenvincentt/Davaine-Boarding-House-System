import { PageMeta } from '@/components/common/PageMeta';
import { MainContentArea } from '@/components/layout/MainContentArea';
import { ComingSoonPlaceholder } from '@/components/common/ComingSoonPlaceholder';

export default function TenantDirectoryPage() {
  return (
    <MainContentArea>
      <PageMeta title="Tenant Directory" description="Browse tenant profiles, contact info, and move-in history." />
      <ComingSoonPlaceholder
        icon="directory"
        title="Tenant Directory"
      />
    </MainContentArea>
  );
}
