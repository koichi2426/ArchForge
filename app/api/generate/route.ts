import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';

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

    // 未解決の型はそのまま返す
    return fieldName;
};

// テンプレートファイルを読み込み、コンパイルする関数
const loadTemplate = (templatePath: string): HandlebarsTemplateDelegate => {
    const fullPath = path.join(process.cwd(), 'templates', templatePath);
    try {
        const source = fs.readFileSync(fullPath, 'utf-8');
        return Handlebars.compile(source);
    } catch (error) {
        console.error(`Error loading template ${templatePath}:`, error);
        // テンプレート読み込みエラーの場合は、エラーメッセージを返すテンプレートを返すなど、適切なエラーハンドリングを行う
        return Handlebars.compile('// Error loading template');
    }
};

// Handlebarsテンプレートをロード (起動時に一度だけロードされることを想定)
const entityTemplate = loadTemplate('ts/domain/entity.hbs');
const repositoryTemplate = loadTemplate('ts/domain/repository.hbs'); // リポジトリ用のテンプレートも追加
const usecaseTemplate = loadTemplate('ts/usecase/usecase.hbs'); // ユースケース用のテンプレートも追加
// 必要に応じて他のテンプレートもここにロード

const generateDomainFileContent = (domain: any, allDomains: any[], language: string): string => {
    // テンプレートに渡すためのデータを作成
    const dependencies: string[] = [];

    // 属性の依存関係を収集
    domain.attributes.forEach((attr: any) => {
        const resolved = resolveType(attr.type, allDomains);
        if (resolved !== attr.type) dependencies.push(resolved);
    });

    // メソッドの引数・戻り値の依存関係を収集
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

    // 重複を除外し、自分自身やプリミティブ型を除いてimport用のデータ形式に変換
    const uniqueDependencies = Array.from(new Set(dependencies))
        .filter(dep => !['string', 'number', 'boolean', 'Date', 'Array', 'Map', 'Set', 'any', domain.name].includes(dep))
        .map(dep => ({ name: dep, from: `./${dep.toLowerCase()}` }));

    // 属性データをテンプレート用に整形
    const propertiesData = domain.attributes.map((attr: any) => ({
        name: attr.name,
        type: resolveType(attr.type, allDomains),
    }));

    // メソッドデータをテンプレート用に整形
    const methodsData = domain.methods.map((method: any) => ({
        name: method.name,
        // 引数リストを型名の配列として渡す
        inputs: method.inputs.split(',').map((s: string) => s.trim()).filter(Boolean).map((type: string) => resolveType(type, allDomains)),
        output: resolveType(method.output.trim(), allDomains),
    }));

    // テンプレートに渡すデータオブジェクトを作成
    const templateData = {
        name: domain.name,
        imports: uniqueDependencies,
        properties: propertiesData,
        methods: methodsData,
        domainType: domain.domainType, // テンプレート内でドメインタイプを使う可能性を考慮
    };

    // ドメインタイプに応じて適切なテンプレートをレンダリング
    if (domain.domainType === 'entity' || domain.domainType === 'valueObject') {
         // EntityとValue Objectは一旦同じテンプレートを使用
        return entityTemplate(templateData);
    } else if (domain.domainType === 'domainService') {
        // Domain Service用のテンプレートが別途必要であれば作成し、ここで使用
        // 今はないので、Entityテンプレートを使うか、簡易的に出力。ここではEntityテンプレートを使用する。
         // DomainServiceテンプレートがある場合は以下のようにする:
         // return domainServiceTemplate(templateData);
         return entityTemplate(templateData); // 一旦Entityテンプレートで代用
    }

    return ''; // 未定義のドメインタイプ
};

const generateRepositoryContent = (domainName: string, language: string): string => {
    // リポジトリテンプレート用のデータを作成
    const templateData = {
        domainName: domainName,
        domainFileName: domainName.toLowerCase(),
    };
    // リポジトリテンプレートをレンダリング
    return repositoryTemplate(templateData);
};

const generateUsecaseContent = (usecase: any, allDomains: any[], language: string): string => {
    // ユースケーステンプレート用のデータを作成
    const inputInterfaceName = `${usecase.name}Input`;
    const outputInterfaceName = `${usecase.name}Output`;
    const usecaseInterfaceName = `I${usecase.name}UseCase`;
    const interactorName = `${usecase.name}Interactor`;

    const inputFields = usecase.inputFields.map((f: any) => ({ name: f.name, type: resolveType(f.name, allDomains) }));
    const outputFields = usecase.outputFields.map((f: any) => ({ name: f.name, type: resolveType(f.name, allDomains) }));

    // 依存関係にあるリポジトリを収集し、import用のデータ形式に変換
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

    // 重複を除去
    const uniqueRepositoryDependencies = Array.from(new Set(repositoryDependencies.map(dep => JSON.stringify(dep)))).map(dep => JSON.parse(dep));

    // テンプレートに渡すデータオブジェクトを作成
    const templateData = {
        usecaseName: usecase.name,
        inputInterfaceName,
        outputInterfaceName,
        usecaseInterfaceName,
        interactorName,
        inputFields,
        outputFields,
        repositoryImports: uniqueRepositoryDependencies,
        // リポジトリ依存をファクトリやコンストラクタ向けに整形
        repositoryDeps: uniqueRepositoryDependencies.map(dep => ({
             paramName: dep.name.replace('Repository', 'Repo').toLowerCase(),
             paramType: dep.name,
        })),
    };

    // ユースケーステンプレートをレンダリング
    return usecaseTemplate(templateData);
};

const generateAdapterFile = (name: string, language: string): string => {
    let content = '';
    content += `export class ${name}Adapter {
`;
    content += `  constructor() {}

`;
    content += `}
`;
    return content;
};

const generateInfrastructureFile = (name: string, language: string): string => {
    let content = '';
    content += `export class ${name}Infrastructure {
`;
    content += `  constructor() {}

`;
    content += `}
`;
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
            // generateDomainFileContentはテンプレートで内容を生成する
            domainFolder.file(domainFileName, generateDomainFileContent(domain, domains, language));

            if (domain.domainType === 'entity') {
                const repoFileName = `${domain.name}Repository.ts`;
                 // generateRepositoryContentもテンプレートで内容を生成する
                domainFolder.file(repoFileName, generateRepositoryContent(domain.name, language));
            }
        });
    }

    if (usecaseFolder) {
        usecases.forEach((usecase: any) => {
            const usecaseFileName = `${usecase.name}UseCase.ts`;
             // generateUsecaseContentもテンプレートで内容を生成する
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
