import type { TSESLint } from '@typescript-eslint/utils';
import chalk from 'chalk';
import fs, { readdirSync } from 'node:fs';
import path from 'node:path';
import { format, resolveConfig } from 'prettier';

// Import directly from source to ensure the latest rules are included
import eslintPluginTemplate from '../../packages/eslint-plugin-template/src';
import eslintPlugin from '../../packages/eslint-plugin/src';

interface LinterConfigRules {
  [name: string]:
    | TSESLint.Linter.RuleLevel
    | TSESLint.Linter.RuleLevelAndOptions;
}

interface LinterConfig extends TSESLint.ClassicConfig.Config {
  extends?: string | string[];
  plugins?: string[];
}

const eslintPluginMaxRuleNameLength = Object.keys(eslintPlugin.rules).reduce(
  (acc, name) => Math.max(acc, name.length),
  0,
);
const eslintPluginTemplateMaxRuleNameLength = Object.keys(
  eslintPluginTemplate.rules,
).reduce((acc, name) => Math.max(acc, name.length), 0);

const MAX_RULE_NAME_LENGTH =
  eslintPluginMaxRuleNameLength > eslintPluginTemplateMaxRuleNameLength
    ? eslintPluginMaxRuleNameLength
    : eslintPluginTemplateMaxRuleNameLength;

const DEFAULT_RULE_SETTING = 'warn';

const allRulesInEslintPlugin = readdirSync(
  path.resolve(__dirname, '../../packages/eslint-plugin/src/rules'),
).map((rule) => rule.replace('.ts', ''));
const allRulesInEslintPluginTemplate = readdirSync(
  path.resolve(__dirname, '../../packages/eslint-plugin-template/src/rules'),
).map((rule) => rule.replace('.ts', ''));

// Ensure all rules are exported by the plugins
ensureAllRulesAreExportedByPlugin('eslint-plugin');
ensureAllRulesAreExportedByPlugin('eslint-plugin-template');

const eslintPluginRuleEntries = Object.entries(eslintPlugin.rules).sort(
  (a, b) => a[0].localeCompare(b[0]),
);
const eslintPluginTemplateRuleEntries = Object.entries(
  eslintPluginTemplate.rules,
).sort((a, b) => a[0].localeCompare(b[0]));

/**
 * Helper function reduces records to key - value pairs.
 * @param config
 * @param entry
 * @param settings
 */
function reducer(
  ruleNamePrefix: '@angular-eslint/' | '@angular-eslint/template/',
  config: LinterConfigRules,
  entry: [
    string,
    TSESLint.RuleModule<
      string,
      unknown[],
      { recommended?: string; requiresTypeChecking?: boolean }
    >,
  ],
  settings: {
    errorLevel?: 'error';
    filterDeprecated: boolean;
    filterRequiresTypeChecking?: 'include' | 'exclude';
  },
): LinterConfigRules {
  const key = entry[0];
  const value = entry[1];

  if (settings.filterDeprecated && value.meta.deprecated) {
    return config;
  }

  // Explicitly exclude rules requiring type-checking
  if (
    settings.filterRequiresTypeChecking === 'exclude' &&
    value.meta.docs?.requiresTypeChecking === true
  ) {
    return config;
  }

  // Explicitly include rules requiring type-checking
  if (
    settings.filterRequiresTypeChecking === 'include' &&
    value.meta.docs?.requiresTypeChecking !== true
  ) {
    return config;
  }

  const ruleName = `${ruleNamePrefix}${key}`;
  const recommendation = value.meta.docs?.recommended ? 'error' : undefined;
  const usedSetting:
    | TSESLint.Linter.RuleLevel
    | TSESLint.Linter.RuleLevelAndOptions = settings.errorLevel
    ? settings.errorLevel
    : !recommendation
      ? DEFAULT_RULE_SETTING
      : recommendation;

  console.log(
    `${chalk.dim(ruleNamePrefix)}${key.padEnd(MAX_RULE_NAME_LENGTH)}`,
    '=',
    usedSetting === 'error'
      ? chalk.red(usedSetting)
      : chalk.yellow(usedSetting),
  );

  config[ruleName] = usedSetting;
  return config;
}

/**
 * Helper function for writing formatted JSON configuration.
 */
async function writeJsonConfig(
  config: LinterConfig,
  filePath: string,
): Promise<void> {
  const configStr = await format(JSON.stringify(config), {
    ...(await resolveConfig(__dirname)),
    parser: 'json',
  });
  fs.writeFileSync(filePath, configStr);
}

/**
 * Helper function for writing formatted TypeScript based configuration.
 */
async function writeTsBasedConfig(
  config: string,
  filePath: string,
): Promise<void> {
  const configStr = await format(config, {
    ...(await resolveConfig(__dirname)),
    parser: 'typescript',
  });
  fs.writeFileSync(filePath, configStr);
}

(async function main() {
  console.log();
  console.log(
    '------------------------------ TS => All Rules ------------------------------\n',
  );
  await tsPluginAll();

  console.log();
  console.log(
    '------------------------------ TS => Recommended Rules ------------------------------\n',
  );

  await tsPluginRecommended();

  console.log();
  console.log(
    '------------------------------ Template => All Rules ------------------------------\n',
  );

  await templatePluginAll();

  console.log();
  console.log(
    '------------------------------ Template => Recommended ------------------------------',
  );

  await templatePluginRecommended();

  console.log();
  console.log(
    '------------------------------ Template => Accessibility ------------------------------',
  );

  await templatePluginAccessibility();

  console.log();
})();

const autogeneratedDisclaimer = `/**
 * DO NOT EDIT THIS FILE
 *
 * In order to update this config, please run \`pnpm update-rule-configs\`.
 */`;

async function tsPluginAll() {
  const rules = {
    ...eslintPluginRuleEntries.reduce<LinterConfigRules>(
      (config, entry) =>
        reducer('@angular-eslint/', config, entry, {
          errorLevel: 'error',
          filterDeprecated: false,
        }),
      {},
    ),
  };

  // @angular-eslint/eslint-plugin -> all.json
  const jsonConfig: LinterConfig = {
    parser: '@typescript-eslint/parser',
    plugins: ['@angular-eslint'],
    rules,
  };
  await writeJsonConfig(
    jsonConfig,
    path.resolve(
      __dirname,
      '../../packages/eslint-plugin/src/configs/all.json',
    ),
  );

  // angular-eslint/ts-all
  const tsConfig = `${autogeneratedDisclaimer}

import type { TSESLint } from '@typescript-eslint/utils';

import tsBaseConfig from './ts-base';

export default (
  plugin: TSESLint.FlatConfig.Plugin,
  parser: TSESLint.FlatConfig.Parser,
): TSESLint.FlatConfig.ConfigArray => [
  tsBaseConfig(plugin, parser ),
  {
    name: 'angular-eslint/ts-all',
    rules: ${JSON.stringify(rules, null, 2)},
  }
];
`;
  await writeTsBasedConfig(
    tsConfig,
    path.resolve(
      __dirname,
      '../../packages/angular-eslint/src/configs/ts-all.ts',
    ),
  );
}

async function tsPluginRecommended() {
  const rules = {
    ...eslintPluginRuleEntries
      .filter((entry) => !!entry[1].meta.docs?.recommended)
      .reduce<LinterConfigRules>(
        (config, entry) =>
          reducer('@angular-eslint/', config, entry, {
            filterDeprecated: false,
            filterRequiresTypeChecking: 'exclude',
          }),
        {},
      ),
    /**
     * Special case use-lifecycle-interface=warn for now to avoid breaking change.
     *
     * TODO: look into bringing back the controls for error vs warn in recommended
     * configs during v18 releases now that we can influence the types in RuleCreator.
     */
    '@angular-eslint/use-lifecycle-interface': 'warn',
  };

  // @angular-eslint/eslint-plugin -> recommended.json
  const jsonConfig: LinterConfig = {
    parser: '@typescript-eslint/parser',
    plugins: ['@angular-eslint'],
    rules: rules as any, // TODO: investigate this type error
  };
  await writeJsonConfig(
    jsonConfig,
    path.resolve(
      __dirname,
      '../../packages/eslint-plugin/src/configs/recommended.json',
    ),
  );

  // angular-eslint/ts-recommended
  const tsConfig = `${autogeneratedDisclaimer}

import type { TSESLint } from '@typescript-eslint/utils';

import tsBaseConfig from './ts-base';

export default (
  plugin: TSESLint.FlatConfig.Plugin,
  parser: TSESLint.FlatConfig.Parser,
): TSESLint.FlatConfig.ConfigArray => [
  tsBaseConfig(plugin, parser),
  {
    name: 'angular-eslint/ts-recommended',
    rules: ${JSON.stringify(rules, null, 2)}
  },
];
`;
  await writeTsBasedConfig(
    tsConfig,
    path.resolve(
      __dirname,
      '../../packages/angular-eslint/src/configs/ts-recommended.ts',
    ),
  );
}

async function templatePluginAll() {
  const rules = eslintPluginTemplateRuleEntries.reduce<LinterConfigRules>(
    (config, entry) =>
      reducer('@angular-eslint/template/', config, entry, {
        errorLevel: 'error',
        filterDeprecated: false,
      }),
    {},
  );

  // @angular-eslint/eslint-plugin-template -> all.json
  const jsonConfig: LinterConfig = {
    parser: '@angular-eslint/template-parser',
    plugins: ['@angular-eslint/template'],
    rules,
  };
  await writeJsonConfig(
    jsonConfig,
    path.resolve(
      __dirname,
      '../../packages/eslint-plugin-template/src/configs/all.json',
    ),
  );

  // angular-eslint/template-recommended
  const tsConfig = `${autogeneratedDisclaimer}

import type { TSESLint } from '@typescript-eslint/utils';

import templateBaseConfig from './template-base';

export default (
  plugin: TSESLint.FlatConfig.Plugin,
  parser: TSESLint.FlatConfig.Parser,
): TSESLint.FlatConfig.ConfigArray => [
  templateBaseConfig(plugin, parser),
  {
    name: 'angular-eslint/template-all',
    rules: ${JSON.stringify(rules, null, 2)}
  },
];
`;
  await writeTsBasedConfig(
    tsConfig,
    path.resolve(
      __dirname,
      '../../packages/angular-eslint/src/configs/template-all.ts',
    ),
  );
}

async function templatePluginRecommended() {
  const rules = eslintPluginTemplateRuleEntries
    .filter((entry) => !!entry[1].meta.docs?.recommended)
    .reduce<LinterConfigRules>(
      (config, entry) =>
        reducer('@angular-eslint/template/', config, entry, {
          filterDeprecated: false,
          filterRequiresTypeChecking: 'exclude',
        }),
      {},
    );

  // @angular-eslint/eslint-plugin-template -> recommended.json
  const jsonConfig: LinterConfig = {
    parser: '@angular-eslint/template-parser',
    plugins: ['@angular-eslint/template'],
    rules,
  };
  await writeJsonConfig(
    jsonConfig,
    path.resolve(
      __dirname,
      '../../packages/eslint-plugin-template/src/configs/recommended.json',
    ),
  );

  // angular-eslint/template-recommended
  const tsConfig = `${autogeneratedDisclaimer}

import type { TSESLint } from '@typescript-eslint/utils';

import templateBaseConfig from './template-base';

export default (
  plugin: TSESLint.FlatConfig.Plugin,
  parser: TSESLint.FlatConfig.Parser,
): TSESLint.FlatConfig.ConfigArray => [
  templateBaseConfig(plugin, parser),
  {
    name: 'angular-eslint/template-recommended',
    rules: ${JSON.stringify(rules, null, 2)}
  },
];
`;
  await writeTsBasedConfig(
    tsConfig,
    path.resolve(
      __dirname,
      '../../packages/angular-eslint/src/configs/template-recommended.ts',
    ),
  );
}

async function templatePluginAccessibility() {
  const rules = eslintPluginTemplateRuleEntries
    .filter(
      (entry) =>
        !!entry[1].meta.docs?.description.startsWith('[Accessibility]'),
    )
    .reduce<LinterConfigRules>(
      (config, entry) =>
        reducer('@angular-eslint/template/', config, entry, {
          filterDeprecated: false,
          errorLevel: 'error',
          filterRequiresTypeChecking: 'exclude',
        }),
      {},
    );

  // @angular-eslint/eslint-plugin-template -> accessibility.json
  const jsonConfig: LinterConfig = {
    parser: '@angular-eslint/template-parser',
    plugins: ['@angular-eslint/template'],
    rules,
  };
  await writeJsonConfig(
    jsonConfig,
    path.resolve(
      __dirname,
      '../../packages/eslint-plugin-template/src/configs/accessibility.json',
    ),
  );

  // angular-eslint/template-recommended
  const tsConfig = `${autogeneratedDisclaimer}

import type { TSESLint } from '@typescript-eslint/utils';

import templateBaseConfig from './template-base';

export default (
  plugin: TSESLint.FlatConfig.Plugin,
  parser: TSESLint.FlatConfig.Parser,
): TSESLint.FlatConfig.ConfigArray => [
  templateBaseConfig(plugin, parser),
  {
    name: 'angular-eslint/template-accessibility',
    rules: ${JSON.stringify(rules, null, 2)}
  },
];
`;
  await writeTsBasedConfig(
    tsConfig,
    path.resolve(
      __dirname,
      '../../packages/angular-eslint/src/configs/template-accessibility.ts',
    ),
  );
}

function ensureAllRulesAreExportedByPlugin(
  pluginName: 'eslint-plugin' | 'eslint-plugin-template',
) {
  readdirSync(
    path.resolve(__dirname, `../../packages/${pluginName}/src/rules`),
  ).forEach((rule) => {
    const ruleName = rule.replace('.ts', '');
    if (
      pluginName === 'eslint-plugin' &&
      !eslintPlugin.rules[ruleName as keyof typeof eslintPlugin.rules]
    ) {
      throw new Error(
        `Rule ${ruleName} is not exported by packages/eslint-plugin/src/index.ts`,
      );
    }
    if (
      pluginName === 'eslint-plugin-template' &&
      !eslintPluginTemplate.rules[
        ruleName as keyof typeof eslintPluginTemplate.rules
      ]
    ) {
      throw new Error(
        `Rule ${ruleName} is not exported by packages/eslint-plugin-template/src/index.ts`,
      );
    }
  });
}
