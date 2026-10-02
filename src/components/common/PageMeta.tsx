import Head from 'expo-router/head';

const BRAND = 'Davaine';

type PageMetaProps = {
  title: string;
  description?: string;
  exact?: boolean;
};

export function PageMeta({ title, description, exact = false }: PageMetaProps) {
  return (
    <Head>
      <title>{exact ? title : `${title} | ${BRAND}`}</title>
      {!!description && <meta name="description" content={description} />}
    </Head>
  );
}
