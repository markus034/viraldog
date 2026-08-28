import os
import urllib.request
import zipfile
import io

def download_file(url, dest_path):
    print(f"Downloading {url} to {dest_path}...")
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    )
    with urllib.request.urlopen(req) as response:
        with open(dest_path, 'wb') as f:
            f.write(response.read())
    print("Done.")

def main():
    fonts_dir = r"c:\Users\marku\PROJETOS\VIRALDOG\frontend\public\fonts"
    os.makedirs(fonts_dir, exist_ok=True)
    
    # 1. Roboto
    try:
        download_file(
            "https://github.com/googlefonts/roboto/raw/main/src/hinted/Roboto-Regular.ttf",
            os.path.join(fonts_dir, "Roboto-Regular.ttf")
        )
        download_file(
            "https://github.com/googlefonts/roboto/raw/main/src/hinted/Roboto-Bold.ttf",
            os.path.join(fonts_dir, "Roboto-Bold.ttf")
        )
    except Exception as e:
        print(f"Failed Roboto download: {e}")
    
    # 2. Anton
    try:
        download_file(
            "https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf",
            os.path.join(fonts_dir, "Anton-Regular.ttf")
        )
    except Exception as e:
        print(f"Failed Anton download: {e}")
    
    # 3. Archivo Black
    try:
        download_file(
            "https://github.com/google/fonts/raw/main/ofl/archivoblack/ArchivoBlack-Regular.ttf",
            os.path.join(fonts_dir, "ArchivoBlack-Regular.ttf")
        )
    except Exception as e:
        print(f"Failed Archivo Black download: {e}")
    
    # 4. League Spartan
    try:
        # Try static LeagueSpartan-Bold first
        download_file(
            "https://github.com/theleagueof/league-spartan/raw/master/fonts/ttf/LeagueSpartan-Bold.ttf",
            os.path.join(fonts_dir, "LeagueSpartan-Bold.ttf")
        )
    except Exception as e:
        print(f"Failed primary League Spartan download, trying fallback: {e}")
        try:
            download_file(
                "https://github.com/google/fonts/raw/main/ofl/leaguespartan/LeagueSpartan%5Bwght%5D.ttf",
                os.path.join(fonts_dir, "LeagueSpartan-Bold.ttf")
            )
        except Exception as e2:
            print(f"Failed League Spartan fallback: {e2}")
    
    # 5. Wedges
    # Download zip from dafont
    zip_path = os.path.join(fonts_dir, "wedges.zip")
    try:
        download_file("https://dl.dafont.com/dl/?f=wedges", zip_path)
        print("Extracting Wedges font...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            for file_info in zip_ref.infolist():
                if file_info.filename.lower().endswith(('.ttf', '.otf')):
                    # extract just the filename to fonts_dir
                    filename = os.path.basename(file_info.filename)
                    dest_file = os.path.join(fonts_dir, filename)
                    with open(dest_file, "wb") as f_out:
                        f_out.write(zip_ref.read(file_info.filename))
                    print(f"Extracted {filename}")
        os.remove(zip_path)
        print("Wedges extraction done.")
    except Exception as e:
        print(f"Failed to download/extract Wedges: {e}")
        
    # 6. Inter
    try:
        download_file(
            "https://raw.githubusercontent.com/Hacktoberfest/hacktoberfest-2020/master/app/assets/fonts/Inter-Regular.ttf",
            os.path.join(fonts_dir, "Inter-Regular.ttf")
        )
        download_file(
            "https://raw.githubusercontent.com/Hacktoberfest/hacktoberfest-2020/master/app/assets/fonts/Inter-Bold.ttf",
            os.path.join(fonts_dir, "Inter-Bold.ttf")
        )
    except Exception as e:
        print(f"Failed Inter download: {e}")

if __name__ == "__main__":
    main()
