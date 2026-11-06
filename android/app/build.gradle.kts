import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
}

// Ondertekening: op GitHub uit de geheime instellingen, lokaal uit
// ../../AndroidStudioProjects/jensrun-release.properties (staat buiten de repo).
val localSigning = Properties().apply {
    val file = rootProject.file("../../AndroidStudioProjects/jensrun-release.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
fun signing(name: String): String? = System.getenv(name) ?: localSigning.getProperty(name)

// Elke build op GitHub krijgt een hoger versienummer, zodat Android hem als update ziet.
val buildNumber = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1

android {
    namespace = "nl.timvanbergen.jensrun"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "nl.timvanbergen.jensrun"
        minSdk = 26
        targetSdk = 37
        versionCode = buildNumber
        versionName = "2.0.$buildNumber"
    }

    signingConfigs {
        create("release") {
            signing("JENSRUN_KEYSTORE")?.let { storeFile = file(it) }
            storePassword = signing("JENSRUN_KEYSTORE_PASSWORD")
            keyAlias = signing("JENSRUN_KEY_ALIAS")
            keyPassword = signing("JENSRUN_KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

// De hele game (../public) gaat in de app: geen webapp meer, alles zit erin.
val gameBundel by tasks.registering(Sync::class) {
    from(rootProject.file("../public")) { exclude("sw.js", "beheer.html", ".DS_Store") }
    into(layout.projectDirectory.dir("src/main/assets/www"))
}
tasks.named("preBuild") { dependsOn(gameBundel) }

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity)
}
