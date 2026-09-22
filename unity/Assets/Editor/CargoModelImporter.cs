using UnityEditor;
using UnityEngine;
public sealed class CargoModelImporter:AssetPostprocessor {
 void OnPreprocessModel(){if(!assetPath.Contains("/Resources/Meshy/"))return;var importer=(ModelImporter)assetImporter;importer.globalScale=1;importer.useFileScale=false;importer.importAnimation=false;importer.addCollider=false;importer.isReadable=false;importer.materialImportMode=ModelImporterMaterialImportMode.ImportStandard;}
 void OnPreprocessTexture(){if(!assetPath.Contains("/Resources/Meshy/"))return;var importer=(TextureImporter)assetImporter;importer.maxTextureSize=1024;importer.mipmapEnabled=true;importer.textureCompression=TextureImporterCompression.Compressed;}
}
