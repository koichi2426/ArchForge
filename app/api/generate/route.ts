import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';

// テンプレートファイルを読み込み、コンパイルする関数
const loadTemplate = (templatePath: string): HandlebarsTemplateDelegate => {
    const fullPath = path.join(process.cwd(), 'templates', templatePath);
    try {
        const source = fs.readFileSync(fullPath, 'utf-8');
        return Handlebars.compile(source);
    } catch (error) {
        console.error(`Error loading template ${templatePath}:`, error);
        return Handlebars.compile('// Error loading template\n');
    }
};

const entityTemplate = loadTemplate('ts/domain/entity.hbs');
const valueObjectTemplate = loadTemplate('ts/domain/valueObject.hbs');
const domainServiceTemplate = loadTemplate('ts/domain/domain_service.hbs');
const repositoryTemplate = loadTemplate('ts/domain/repository.hbs');
const usecaseTemplate = loadTemplate('ts/usecase/usecase.hbs');

const generateDomainFileContent = (domain: any, allDomains: any[], language: string): string => {
    const dependencies: string[] = [];

    domain.attributes.forEach((attr: any) => {
        dependencies.push(attr.type);
    });

    domain.methods.forEach((method: any) => {
        const inputTypes = method.inputs.split(',').map((s: string) => s.trim()).filter(Boolean);
        inputTypes.forEach((type: string) => dependencies.push(type));
        dependencies.push(method.output.trim());
    });

    const uniqueDependencies = Array.from(new Set(dependencies))
        .filter(dep => !['string', 'number', 'boolean', 'Date', 'Array', 'Map', 'Set', 'any', domain.name].includes(dep))
        .map(dep => ({ name: dep, from: `./${dep.toLowerCase()}` }));

    const propertiesData = domain.attributes.map((attr: any) => ({
        name: attr.name,
        type: attr.type,
    }));

    const methodsData = domain.methods.map((method: any) => ({
        name: method.name,
        inputs: method.inputs.split(',').map((s: string) => s.trim()).filter(Boolean),
        output: method.output.trim(),
    }));

    const templateData = {
        name: domain.name,
        imports: uniqueDependencies,
        properties: propertiesData,
        methods: methodsData,
        domainType: domain.domainType,
    };

    if (domain.domainType === 'entity') {
        return entityTemplate(templateData);
    } else if (domain.domainType === 'valueObject') {
        return valueObjectTemplate(templateData);
    } else if (domain.domainType === 'domainService') {
        return domainServiceTemplate(templateData);
    }

    return '';
};

const generateRepositoryContent = (domainName: string, language: string): string => {
    const varName = domainName.charAt(0).toLowerCase() + domainName.slice(1);

    const templateData = {
        name: `${domainName}Repository`,
        methods: [
            {
                name: 'findById',
                inputs: ['id: string'],
                output: `${domainName} | null`,
            },
            {
                name: 'save',
                inputs: [`${varName}: ${domainName}`],
                output: 'void',
            },
            {
                name: 'delete',
                inputs: ['id: string'],
                output: 'void',
            },
            {
                name: 'exists',
                inputs: ['id: string'],
                output: 'boolean',
            }
        ]
    };

    return repositoryTemplate(templateData);
};


const generateUsecaseContent = (usecase: any, allDomains: any[], language: string): string => {
    const inputInterfaceName = `${usecase.name}Input`;
    const outputInterfaceName = `${usecase.name}Output`;
    const usecaseInterfaceName = `I${usecase.name}UseCase`;
    const interactorName = `${usecase.name}Interactor`;

    const inputFields = usecase.inputFields.map((f: any) => ({ name: f.name, type: f.type }));
    const outputFields = usecase.outputFields.map((f: any) => ({ name: f.name, type: f.type }));

    const repositoryDependencies: { name: string, from: string }[] = [];
    [...inputFields, ...outputFields].forEach(field => {
        const domain = allDomains.find(d => d.name === field.type && d.domainType === 'entity');
        if (domain) {
            repositoryDependencies.push({
                name: `${domain.name}Repository`,
                from: `../domain/${domain.name.toLowerCase()}.repository`
            });
        }
    });

    const uniqueRepositoryDependencies = Array.from(new Set(repositoryDependencies.map(dep => JSON.stringify(dep)))).map(dep => JSON.parse(dep));

    const templateData = {
        usecaseName: usecase.name,
        inputInterfaceName,
        outputInterfaceName,
        usecaseInterfaceName,
        interactorName,
        inputFields,
        outputFields,
        repositoryImports: uniqueRepositoryDependencies,
        repositoryDeps: uniqueRepositoryDependencies.map(dep => ({
            paramName: dep.name.replace('Repository', 'Repo').toLowerCase(),
            paramType: dep.name,
        })),
    };

    return usecaseTemplate(templateData);
};

const generateAdapterFile = (name: string, language: string): string => {
    return `export class ${name}Adapter {\n  constructor() {}\n}\n`;
};

const generateInfrastructureFile = (name: string, language: string): string => {
    return `export class ${name}Infrastructure {\n  constructor() {}\n}\n`;
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
        if (apiAdapterFolder) apiAdapterFolder.file('README.md', '## API Adapters');

        const presenterAdapterFolder = adapterFolder.folder('presenter');
        if (presenterAdapterFolder) presenterAdapterFolder.file('README.md', '## Presenter Adapters');

        const repositoryAdapterFolder = adapterFolder.folder('repository');
        if (repositoryAdapterFolder) repositoryAdapterFolder.file('README.md', '## Repository Implementations');
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
