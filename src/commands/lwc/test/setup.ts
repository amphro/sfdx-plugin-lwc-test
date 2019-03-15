import { core, SfdxCommand } from '@salesforce/command';
import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';

core.Messages.importMessagesDirectory(__dirname);
const messages = core.Messages.loadMessages('sfdx-lwc-test', 'setup');

export default class Run extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
  `$ sfdx force:lightning:lwc:test:install`
  ];

  protected static requiresProject = true;

  public async run(): Promise<void> {
    const project = await core.Project.resolve();

    const jestConfig = `const { jestConfig } = require('@salesforce/lwc-jest/config');
    module.exports = {
        ...jestConfig,
        // add any custom configurations here
    };`;

    const forceignoreEntry = '# LWC Jest tests\n**/__tests__/**';

    const nodeVersionRet = spawnSync('node', ['-v']);
    if (nodeVersionRet.error) {
      throw new core.SfdxError(messages.getMessage('errorNodeNotFound'));
    }
    const nodeVersion = nodeVersionRet.stdout.slice(1); // strip the v from v8.12.0
    if (nodeVersion < "8.12.0") {
      throw new core.SfdxError(messages.getMessage('errorNodeVersion', [nodeVersion]));
    }

    const npmVersionRet = spawnSync('npm', ['-v']);
    if (npmVersionRet.error) {
      throw new core.SfdxError(messages.getMessage('errorNpmNotFound'));
    }

    const packageJsonPath = path.join(project.getPath(), 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      throw new core.SfdxError(messages.getMessage('errorNoPackageJson'));
    }

    const testScripts = {
      "test:unit": "lwc-jest",
      "test:unit:debug": "lwc-jest --debug",
      "test:unit:watch": "lwc-jest --watch"
    }
    const packageJson = require(packageJsonPath);
    const scripts = packageJson.scripts;
    if (!scripts) {
      packageJson.scripts = testScripts;
    } else if (scripts["test:unit"] || scripts["test:unit:debug"] || scripts["test:unit:watch"]) {
      // TODO(tbliss): error here or just log and ignore?
      throw new core.SfdxError(messages.getMessage('errorExistingScripts'));
    } else {
      packageJson.scripts = { ...scripts, ...testScripts};
    }
    // TODO(tbliss): maybe make copy of package.json first to tmp location, replace if something goes wrong...
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4), { encoding: 'utf8' });

    this.ux.log('Installing @salesforce/lwc-jest node package...');
    //const lwcJestInstallRet = spawnSync('npm', ['add', '--save-dev', '@salesforce/lwc-jest'], { stdio: "inherit" });
    // if (lwcJestInstallRet.error) {
    //   throw new core.SfdxError(messages.getMessage('errorLwcJestInstall', [lwcJestInstallRet.error]));
    // }

    const forceignorePath = path.join(project.getPath(), '.forceignore');
    if (!fs.existsSync(forceignorePath)) {
      this.ux.log('Creating missing .forceignore file found in the project root...');
      fs.writeFileSync(forceignorePath, forceignoreEntry);
    } else {
      const forceignore = fs.readFileSync(forceignorePath, { encoding: 'utf8' });
      if (forceignore.indexOf('**/__tests__/**') === -1) {
        this.ux.log('No "**/__tests__/** entry found in .forceignore. Adding now...');
        fs.appendFileSync(forceignorePath, forceignoreEntry,{ encoding: 'utf8' });
      }
    }

    const jestConfigPath = path.join(project.getPath(), 'jest.config.js');
    const packageJsonJest = packageJson.jest;
    if (packageJsonJest) {
      this.ux.log('Jest configuration found in package.json. Skipping creation of jest.config.js file.');
    } else if (fs.existsSync(jestConfigPath)) {
      this.ux.log('Jest configuration found in jest.config.js. Skipping creation of new config file.');
    } else {
      // no existing Jest config present in workspace
      this.ux.log('Creating jest.config.js configuration file in the project root...');
      fs.writeFileSync(jestConfigPath, jestConfig);
    }
  }
}