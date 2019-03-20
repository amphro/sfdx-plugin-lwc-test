import { core, SfdxCommand } from '@salesforce/command';
import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';
import { FileWriter } from '../../../lib/fileWriter';

core.Messages.importMessagesDirectory(__dirname);
const messages = core.Messages.loadMessages('sfdx-lwc-test', 'setup');

const testScripts = {
  "test:unit": "lwc-jest",
  "test:unit:debug": "lwc-jest --debug",
  "test:unit:watch": "lwc-jest --watch"
};

const jestConfig = `const { jestConfig } = require('@salesforce/lwc-jest/config');
module.exports = {
    ...jestConfig,
    // add any custom configurations here
};`;

const forceignoreEntry = '\n# LWC Jest tests\n**/__tests__/**';

export default class Run extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
    `$ sfdx force:lightning:lwc:test:install`
  ];

  protected static requiresProject = true;

  public async run(): Promise<core.AnyJson> {
    const project = await core.Project.resolve();
    const fileWriter = new FileWriter();

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

    const packageJson = require(packageJsonPath);
    const scripts = packageJson.scripts;
    if (!scripts) {
      packageJson.scripts = testScripts;
      this.ux.log('Queueing addition of test scripts to package.json...');
      fileWriter.queueWrite(packageJsonPath, JSON.stringify(packageJson, null, 2), { encoding: 'utf8' });
    } else if (!scripts["test:unit"] && !scripts["test:unit:debug"] && !scripts["test:unit:watch"]) {
      this.ux.log('Queueing addition of test scripts to package.json...');
      packageJson.scripts = { ...scripts, ...testScripts};
      fileWriter.queueWrite(packageJsonPath, JSON.stringify(packageJson, null, 2), { encoding: 'utf8' });
    } else {
      this.ux.log('One or more of the following package.json scripts already exists, skipping adding of test scripts: "test:unit", "test:unit:debug", "test:unit:watch"');
    }

    const jestConfigPath = path.join(project.getPath(), 'jest.config.js');
    const packageJsonJest = packageJson.jest;
    if (packageJsonJest) {
      this.ux.log('Jest configuration found in package.json. Skipping creation of jest.config.js file.');
    } else if (fs.existsSync(jestConfigPath)) {
      this.ux.log('Jest configuration found in jest.config.js. Skipping creation of new config file.');
    } else {
      // no known existing Jest config present in workspace
      this.ux.log('Queueing creation of jest.config.js file in project root...');
      fileWriter.queueWrite(jestConfigPath, jestConfig);
    }

    const forceignorePath = path.join(project.getPath(), '.forceignore');
    if (!fs.existsSync(forceignorePath)) {
      this.ux.log('Queueing creation of .forceignore file in project root...');
      fileWriter.queueWrite(forceignorePath, forceignoreEntry);
    } else {
      const forceignore = fs.readFileSync(forceignorePath, { encoding: 'utf8' });
      if (forceignore.indexOf('**/__tests__/**') === -1) {
        this.ux.log('Queueing modification of .forceignore file in project root...');
        fileWriter.queueAppend(forceignorePath, forceignoreEntry, { encoding: 'utf8' });
      }
    }

    this.ux.log('Making necessary file updates now...');
    fileWriter.writeFiles();
    this.ux.log('File modifications complete');

    // do this as the last step to
    this.ux.log('Installing @salesforce/lwc-jest node package...');
    const lwcJestInstallRet = spawnSync('npm', ['add', '--save-dev', '@salesforce/lwc-jest'], { stdio: "inherit" });
    if (lwcJestInstallRet.error) {
      throw new core.SfdxError(messages.getMessage('errorLwcJestInstall', [lwcJestInstallRet.error]));
    }

    this.ux.log('Test setup complete');
    return {
      message: 'Test setup complete',
      exitCode: 0,
    };
  }
}
