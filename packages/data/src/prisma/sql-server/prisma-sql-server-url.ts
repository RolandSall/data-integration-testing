/** SQL Server connection facts required by Prisma's SQL Server connector. */
export interface PrismaSqlServerConnectionDetails {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly username: string;
  readonly password: string;
}

/** Prisma-specific SQL Server connection options controlled by the consumer. */
export interface PrismaSqlServerUrlOptions {
  readonly encrypt?: boolean;
  readonly trustServerCertificate?: boolean;
  readonly schema?: string;
}

/**
 * Builds a Prisma SQL Server URL from structurally compatible connection facts.
 *
 * This adapter intentionally has no dependency on a container package. A Testcontainers
 * resource, deployment secret, or another provider can supply the same typed facts.
 */
export const prismaSqlServerUrlFor = (
  connection: PrismaSqlServerConnectionDetails,
  options: PrismaSqlServerUrlOptions = {},
): string => {
  const properties = [
    `database=${escapeProperty(connection.database)}`,
    `user=${escapeProperty(connection.username)}`,
    `password=${escapeProperty(connection.password)}`,
  ];

  if (options.schema !== undefined) {
    properties.push(`schema=${escapeProperty(options.schema)}`);
  }
  if (options.encrypt !== undefined) {
    properties.push(`encrypt=${String(options.encrypt)}`);
  }
  if (options.trustServerCertificate !== undefined) {
    properties.push(
      `trustServerCertificate=${String(options.trustServerCertificate)}`,
    );
  }

  return `sqlserver://${connection.host}:${connection.port};${properties.join(';')}`;
};

const SPECIAL_PROPERTY_CHARACTER = /[:\\=;/[\]{}]/;

const escapeProperty = (value: string): string =>
  SPECIAL_PROPERTY_CHARACTER.test(value) ? `{${value}}` : value;
