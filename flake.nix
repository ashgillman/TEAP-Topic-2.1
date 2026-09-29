{
  description = "TEAP Topic 2.1 GitHub Pages build environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { nixpkgs, ... }:
    let
      systems = [ "aarch64-darwin" "x86_64-darwin" "x86_64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let pkgs = import nixpkgs { inherit system; };
        in {
          default = pkgs.mkShell {
            packages = [
              pkgs.emacs
              pkgs.nodejs
              pkgs.rsync
            ];
            shellHook = ''
              export LC_ALL="C.UTF-8"
              export LANG="en_US.UTF-8"
            '';
          };
        });
    };
}
