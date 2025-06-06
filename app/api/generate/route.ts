import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';

const resolveType = (fieldName: string, domains: any[]): string => {
    if (!fieldName) return 'any';

    const primitiveTypes = ['string', 'number', 'boolean', 'Date', 'Array', 'Map', 'Set'];
    if (primitiveTypes.includes(fieldName)) {
        return fieldName;
    }

    const domainMatch = domains.find(d => d.name === fieldName);
    if (domainMatch) {
        return domainMatch.name;
    }

    const parts = fieldName.split('.');
    if (parts.length === 2) {
        const domain = domains.find(d => d.name === parts[0]);
        if (domain) {
            const attribute = domain.attributes.find((a: any) => a.name === parts[1]);
            if (attribute) return attribute.type;
        }
    }

    return 'any';
};

const generateImports = (dependencies: string[]): string => {
    if (dependencies.length === 0) return '';
    const domainImports = dependencies
        .filter(dep => !['string', 'number', 'boolean', 'Date', 'Array', 'Map', 'Set', 'any'].includes(dep))
        .map(dep => `import { ${dep} } from './${dep.toLowerCase()}';`);
    return domainImports.join('\n') + (domainImports.length > 0 ? '\n\n' : '');
};

const generateDomainFileContent = (domain: any, allDomains: any[], language: string): string => {
    const dependencies: string[] = [];
    domain.attributes.forEach((attr: any) => {
        const resolved = resolveType(attr.type, allDomains);
        if (resolved !== attr.type) dependencies.push(resolved);
    });
    domain.methods.forEach((method: any) => {
        const inputTypes = method.inputs.split(',').map((s: string) => s.trim()).filter(Boolean);
        inputTypes.forEach((type: string) => {
            const resolved = resolveType(type, allDomains);
            if (resolved !== type) dependencies.push(resolved);
        });
        const outputType = method.output.trim();
        const resolved = resolveType(outputType, allDomains);
        if (resolved !== outputType) dependencies.push(resolved);
    });

    const imports = generateImports(Array.from(new Set(dependencies)));
    let content = imports;

    if (domain.domainType === 'entity' || domain.domainType === 'valueObject') {
        content += `export interface ${domain.name} {\n`;
        domain.attributes.forEach((attr: any) => {
            const resolved = resolveType(attr.type, allDomains);
            content += `  ${attr.name}: ${resolved};\n`;
        });
        if (domain.domainType === 'entity') {
            domain.methods.forEach((method: any) => {
                const inputParams = method.inputs.split(',').map((s: string) => s.trim()).filter(Boolean).map((type: string, index: number) => `arg${index}: ${resolveType(type, allDomains)}`).join(', ');
                const outputType = resolveType(method.output.trim(), allDomains);
                content += `\n  ${method.name}(${inputParams}): ${outputType};\n`;
            });
        }
        content += `}\n`;
    } else if (domain.domainType === 'domainService') {
        content += `export interface ${domain.name} {\n`;
        domain.methods.forEach((method: any) => {
            const inputParams = method.inputs.split(',').map((s: string) => s.trim()).filter(Boolean).map((type: string, index: number) => `arg${index}: ${resolveType(type, allDomains)}`).join(', ');
            const outputType = resolveType(method.output.trim(), allDomains);
            content += `\n  ${method.name}(${inputParams}): ${outputType};\n`;
        });
        content += `}\n`;
    }

    return content;
};

const generateRepositoryContent = (domainName: string, language: string): string => {
    let content = `import { ${domainName} } from './${domainName.toLowerCase()}';\n\n`;
    content += `export interface ${domainName}Repository {\n`;
    content += `  findById(id: string): Promise<${domainName} | null>;\n`;
    content += `  save(${domainName.toLowerCase()}: ${domainName}): Promise<void>;\n`;
    content += `}\n`;
    return content;
};

const generateUsecaseContent = (usecase: any, allDomains: any[], language: string): string => {
    const inputInterfaceName = `${usecase.name}Input`;
    const outputInterfaceName = `${usecase.name}Output`;
    const usecaseInterfaceName = `I${usecase.name}UseCase`;
    const interactorName = `${usecase.name}Interactor`;
    const factoryFunctionName = `create${usecase.name}UseCase`;

    const inputFields = usecase.inputFields.map((f: any) => ({ name: f.name, type: resolveType(f.name, allDomains) }));
    const outputFields = usecase.outputFields.map((f: any) => ({ name: f.name, type: resolveType(f.name, allDomains) }));

    const dependencies: string[] = [];
    [...inputFields, ...outputFields].forEach(field => {
        const domainName = field.type;
        const domain = allDomains.find(d => d.name === domainName && d.domainType === 'entity');
        if (domain) {
            dependencies.push(`${domain.name}Repository`);
        }
    });

    const imports = generateImports(Array.from(new Set(dependencies)));
    let content = imports;

    content += `export interface ${inputInterfaceName} {\n`;
    inputFields.forEach((field: any) => {
        content += `  ${field.name}: ${field.type};\n`;
    });
    content += `}\n\n`;

    content += `export interface ${outputInterfaceName} {\n`;
    outputFields.forEach((field: any) => {
        content += `  ${field.name}: ${field.type};\n`;
    });
    content += `}\n\n`;

    content += `export interface ${usecaseInterfaceName} {\n`;
    content += `  execute(input: ${inputInterfaceName}): Promise<${outputInterfaceName}>;\n`;
    content += `}\n\n`;

    const factoryDeps = dependencies.map(dep => ({ name: dep.toLowerCase().replace('repository', 'Repo'), type: dep }));
    content += `export function ${factoryFunctionName}(\n`;
    factoryDeps.forEach((dep, index) => {
        content += `  ${dep.name}: ${dep.type}${index < factoryDeps.length - 1 ? ',' : ''}\n`;
    });
    content += `): ${usecaseInterfaceName} {\n`;
    content += `  return new ${interactorName}(${factoryDeps.map(dep => dep.name).join(', ')});\n`;
    content += `}\n\n`;

    content += `export class ${interactorName} implements ${usecaseInterfaceName} {\n`;
    content += `  constructor(\n`;
    factoryDeps.forEach((dep, index) => {
        content += `    private readonly ${dep.name}: ${dep.type}${index < factoryDeps.length - 1 ? ',' : ''}\n`;
    });
    content += `  ) {}\n\n`;

    content += `  async execute(input: ${inputInterfaceName}): Promise<${outputInterfaceName}> {\n`;
    content += `    console.log('Executing ${usecase.name} with input:', input);\n`;

    if (dependencies.some(dep => dep.endsWith('Repository'))) {
        dependencies.filter(dep => dep.endsWith('Repository')).forEach(repoDep => {
            const repoName = repoDep.toLowerCase().replace('repository', 'Repo');
            content += `    // const entity = await this.${repoName}.findById(input.someEntityId);\n`;
        });
    }

    content += `\n    const output: ${outputInterfaceName} = {};\n`;
    outputFields.forEach((field: any) => {
        content += `    // output.${field.name} = /* calculate value */ ${field.type === 'any' ? '{}' : ''};\n`;
    });

    content += `    return Promise.resolve(output);\n`;
    content += `  }\n`;
    content += `}\n`;

    return content;
};

const generateAdapterFile = (name: string, language: string): string => {
    let content = '';
    content += `export class ${name}Adapter {\n`;
    content += `  constructor() {}\n\n`;
    content += `}\n`;
    return content;
};

const generateInfrastructureFile = (name: string, language: string): string => {
    let content = '';
    content += `export class ${name}Infrastructure {\n`;
    content += `  constructor() {}\n\n`;
    content += `}\n`;
    return content;
};

export async function POST(req: NextRequest) {
    const { projectName, language, domains, usecases } = await req.json();

    if (language !== 'typescript') {
        return new NextResponse(JSON.stringify({ error: 'Only TypeScript is supported for code generation.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const zip = new JSZip();
    const domainFolder = zip.folder('domain');
    const usecaseFolder = zip.folder('usecase');
    const adapterFolder = zip.folder('adapter');
    const infrastructureFolder = zip.folder('infrastructure');

    if (domainFolder) {
        domains.forEach((domain: any) => {
            const domainFileName = `${domain.name}.ts`;
            domainFolder.file(domainFileName, generateDomainFileContent(domain, domains, language));

            if (domain.domainType === 'entity') {
                const repoFileName = `${domain.name}Repository.ts`;
                domainFolder.file(repoFileName, generateRepositoryContent(domain.name, language));
            }
        });
    }

    if (usecaseFolder) {
        usecases.forEach((usecase: any) => {
            const usecaseFileName = `${usecase.name}UseCase.ts`;
            usecaseFolder.file(usecaseFileName, generateUsecaseContent(usecase, domains, language));
        });
    }

    if (adapterFolder) {
        const apiAdapterFolder = adapterFolder.folder('api');
        if (apiAdapterFolder) {
            apiAdapterFolder.file('README.md', '## API Adapters');
        }

        const presenterAdapterFolder = adapterFolder.folder('presenter');
        if (presenterAdapterFolder) {
            presenterAdapterFolder.file('README.md', '## Presenter Adapters');
        }

        const repositoryAdapterFolder = adapterFolder.folder('repository');
        if (repositoryAdapterFolder) {
            repositoryAdapterFolder.file('README.md', '## Repository Implementations');
        }
    }

    if (infrastructureFolder) {
        infrastructureFolder.file('README.md', '## Infrastructure Layer');
    }

    zip.file('README.md', `# ${projectName || 'My Clean Architecture Project'}\n\nThis is a project generated with a basic Clean Architecture structure in ${language}.`);

    const content = await zip.generateAsync({ type: 'uint8array' });

    return new NextResponse(content, {
        status: 200,
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${(projectName && projectName.length > 0) ? projectName : 'project'}.zip"`,
        },
    });
}
